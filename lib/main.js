const fs = require('fs');
const path = require('path');
const ProjectStore = require('./project-store');
const ProcessManager = require('./process-manager');
const WorkspaceView = require('./workspace-view');

let store;
let processes;
let view;
let panel;
let subscriptions;
let statusTile;
let currentPrompt = '';
let activeTerminalId = null;

function activate() {
  store = new ProjectStore(atom.getConfigDirPath());
  processes = new ProcessManager(handleProcessEvent, {
    claudeCommand: atom.config.get('claude-workspace.claudeCommand') || 'claude'
  });
  syncOpenAtomProjects();
  subscriptions = atom.commands.add('atom-workspace', {
    'claude-workspace:toggle': toggle,
    'claude-workspace:select-project': selectProject,
    'claude-workspace:new-project': newProject,
    'claude-workspace:start-session': startSession,
    'claude-workspace:start-terminal': startInteractiveSession,
    'claude-workspace:resume-session': resumeSession,
    'claude-workspace:send-terminal-input': sendTerminalInput,
    'claude-workspace:stop-terminal': stopTerminal,
    'claude-workspace:interrupt-terminal': interruptTerminal,
    'claude-workspace:delete-session': deleteSession,
    'claude-workspace:rename-session': renameSession,
    'claude-workspace:clear-sessions': clearSessions,
    'claude-workspace:start-dev-server': startDevServer,
    'claude-workspace:stop-dev-server': stopDevServer,
    'claude-workspace:open-preview': openPreview,
    'claude-workspace:refresh-preview': refreshPreview,
    'claude-workspace:open-external-preview': openExternalPreview,
    'claude-workspace:clear-output': clearOutput,
    'claude-workspace:copy-output': copyOutput,
    'claude-workspace:export-output': exportOutput,
    'claude-workspace:remove-project': removeProject
  });
  if (atom.project && typeof atom.project.onDidChangePaths === 'function') {
    subscriptions.add(atom.project.onDidChangePaths(syncOpenAtomProjects));
  }
}

function syncOpenAtomProjects() {
  if (!atom.project || typeof atom.project.getPaths !== 'function') return;
  const paths = atom.project.getPaths().filter(projectPath => fs.existsSync(projectPath));
  const previousActiveId = store.active() && store.active().id;
  paths.forEach(projectPath => {
    const profile = processes.profile(projectPath);
    store.upsert(ProjectStore.defaultProject(projectPath, {
      framework: profile.framework,
      packageManager: profile.packageManager,
      devCommand: profile.devCommand,
      devPort: profile.devPort || 3000
    }));
  });
  const openIds = paths.map(ProjectStore.projectId);
  if (previousActiveId && openIds.includes(previousActiveId)) store.setActive(previousActiveId);
  else if (paths.length) store.setActive(openIds[0]);
  if (view) refresh();
}

function consumeStatusBar(statusBar) {
  const button = document.createElement('button');
  button.className = 'inline-block-tight';
  button.textContent = 'Claude';
  button.title = 'Toggle Claude Workspace sidebar';
  button.addEventListener('click', toggle);
  statusTile = statusBar.addRightTile({ item: button, priority: 100 });
}

function createView() {
  view = new WorkspaceView({
    sidebar: true,
    maxOutputChars: atom.config.get('claude-workspace.maxOutputChars') || 500000,
    onProjectChange: id => { store.setActive(id); currentPrompt = ''; refresh(); },
    onPromptChange: prompt => { currentPrompt = prompt; },
    onTerminalInput: input => sendTerminalInput(input, true),
    onAction: action => ({
      'new-project': newProject,
      'start-session': startSession,
      'start-terminal': startInteractiveSession,
      'resume-session': resumeSession,
      'send-terminal-input': sendTerminalInput,
      'stop-terminal': stopTerminal,
      'interrupt-terminal': interruptTerminal,
      'delete-session': deleteSession,
      'rename-session': renameSession,
      'clear-sessions': clearSessions,
      'start-dev-server': startDevServer,
      'stop-dev-server': stopDevServer,
      'open-preview': openPreview,
      'refresh-preview': refreshPreview,
      'open-external-preview': openExternalPreview,
      'preview-loaded': () => { if (view) view.setStatus('Preview loaded', 'running'); },
      'preview-error': () => { if (view) view.setStatus('Preview load error', 'error'); },
      'preview-console': message => { if (view && message) view.appendOutput('preview', `[console] ${message}`); },
      'clear-output': clearOutput,
      'copy-output': copyOutput,
      'export-output': exportOutput,
      'remove-project': removeProject
    }[action] || (() => {}))()
  });
  return view;
}

function showPanel() {
  if (!panel) {
    createView();
    view.element.classList.add('claude-workspace--sidebar');
    panel = atom.workspace.addRightPanel({ item: view.element, visible: true, priority: 100 });
  } else {
    panel.show();
  }
  refresh();
}

function toggle() {
  if (!panel) showPanel();
  else panel.isVisible() ? panel.hide() : showPanel();
}

function refresh() {
  if (!view) return;
  const active = store.active();
  view.setProjects(store.all().map(project => Object.assign({}, project, {
    status: processes.isRunning('dev', project.id) ? 'dev running' : processes.terminalIds(project.id).length ? 'Claude active' : 'ready',
    sessionCount: project.claudeSessions.length,
    git: processes.gitStatus(project.path)
  })), active && active.id);
  view.setSessions(active ? active.claudeSessions : [], view.selectedSessionId());
  view.setTerminals(active ? processes.terminalIds(active.id) : [], activeTerminalId);
}

async function chooseDirectory() {
  if (typeof atom.pickFolder === 'function') {
    return new Promise(resolve => {
      let settled = false;
      const finish = paths => {
        if (settled) return;
        settled = true;
        const selected = Array.isArray(paths) ? paths[0] : paths;
        resolve(selected ? path.resolve(selected) : null);
      };
      try {
        const result = atom.pickFolder.length <= 1
          ? atom.pickFolder(finish)
          : atom.pickFolder({ prompt: 'Choose a project directory' }, finish);
        if (result && typeof result.then === 'function') result.then(finish).catch(() => finish(null));
        else if (Array.isArray(result)) finish(result);
      } catch (error) {
        finish(null);
      }
    });
  }
  try {
    const electron = require('electron');
    const dialog = (electron.remote && electron.remote.dialog) || electron.dialog;
    if (!dialog || !dialog.showOpenDialogSync) return null;
    const result = dialog.showOpenDialogSync({ properties: ['openDirectory', 'createDirectory'] });
    return result && result[0] ? path.resolve(result[0]) : null;
  } catch (error) {
    notifyError('Could not open project picker', error.message);
    return null;
  }
}

function registerProject(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    notifyError('Project path does not exist', 'Choose an existing local directory.');
    return null;
  }
  const profile = processes.profile(projectPath);
  const project = store.upsert(ProjectStore.defaultProject(projectPath, {
    framework: profile.framework,
    packageManager: profile.packageManager,
    devCommand: profile.devCommand,
    devPort: profile.devPort || 3000
  }));
  atom.project.addPath(project.path);
  showPanel();
  return project;
}

async function selectProject() {
  registerProject(await chooseDirectory());
}

function chooseNewDirectory() {
  try {
    const electron = require('electron');
    const dialog = (electron.remote && electron.remote.dialog) || electron.dialog;
    if (!dialog || !dialog.showSaveDialogSync) return chooseDirectory();
    const result = dialog.showSaveDialogSync({
      title: 'Create project directory',
      defaultPath: path.join(process.env.HOME || process.cwd(), 'new-project')
    });
    if (!result) return null;
    fs.mkdirSync(result, { recursive: true });
    return result;
  } catch (error) {
    notifyError('Could not create project directory', error.message);
    return null;
  }
}

async function newProject() {
  const project = registerProject(await chooseNewDirectory());
  if (project) notify('Project registered', project.name);
}

function requireProject() {
  const project = store.active();
  if (!project) {
    atom.notifications.addWarning('Select a project first.', { dismissable: true });
    showPanel();
  }
  return project;
}

function promptForSession() {
  const prompt = view && view.promptText();
  return prompt || currentPrompt || 'Inspect this project. Explain the stack and how to start the local development server.';
}

function startSession() {
  const project = requireProject();
  if (!project) return;
  const sessionId = (view && view.selectedSessionId()) || (project.claudeSessions[0] && project.claudeSessions[0].id);
  processes.runClaude(project.id, project.path, promptForSession(), sessionId);
  showPanel();
}

function resumeSession() {
  const project = requireProject();
  const sessionId = view && view.selectedSessionId();
  if (!project || !sessionId) {
    atom.notifications.addInfo('Choose a saved Claude session first.');
    return;
  }
  processes.runClaude(project.id, project.path, promptForSession(), sessionId);
  showPanel();
}

function startInteractiveSession() {
  const project = requireProject();
  if (!project) return;
  const sessionId = view && view.selectedSessionId();
  activeTerminalId = processes.runInteractiveClaude(project.id, project.path, null, sessionId);
  showPanel();
}

function sendTerminalInput(input, raw) {
  const project = requireProject();
  if (!project || !view) return;
  const text = typeof input === 'string' ? input : view.promptText() || view.terminalInputText();
  if (!text || !processes.sendInteractiveInput(project.id, text, view.activeTerminalId() || activeTerminalId, raw)) {
    notifyError('Interactive session is not running', 'Start Interactive Claude first.');
  }
}

function stopTerminal() {
  const project = requireProject();
  if (project && view) {
    processes.stopInteractiveClaude(project.id, view.activeTerminalId() || activeTerminalId);
    refresh();
  }
}

function interruptTerminal() {
  const project = requireProject();
  if (project && view) processes.interruptInteractiveClaude(project.id, view.activeTerminalId() || activeTerminalId);
}

function startDevServer() {
  const project = requireProject();
  if (!project) return;
  processes.startDevServer(project.id, project.path, project.devCommand);
  showPanel();
}

function stopDevServer() {
  const project = requireProject();
  if (project) processes.stopDevServer(project.id);
}

function openPreview() {
  const project = requireProject();
  if (!project) return;
  const defaultPort = atom.config.get('claude-workspace.defaultDevPort') || 3000;
  const url = processes.url(project.id) || `http://localhost:${project.devPort || defaultPort}`;
  showPanel();
  view.showPreview(url);
  processes.probeUrl(project.id, url);
}

function refreshPreview() { if (view) view.refreshPreview(); }

function openExternalPreview() {
  const project = requireProject();
  if (!project) return;
  const defaultPort = atom.config.get('claude-workspace.defaultDevPort') || 3000;
  const url = (view && view.previewUrl()) || processes.url(project.id) || `http://localhost:${project.devPort || defaultPort}`;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/.test(url)) {
    notifyError('Preview blocked', 'Only localhost and 127.0.0.1 previews are allowed.');
    return;
  }
  require('electron').shell.openExternal(url);
}

function clearOutput() { if (view) view.clearOutput(); }

function copyOutput() {
  if (view) {
    view.copyOutput();
    notify('Output copied', 'The workspace output is now in the clipboard.');
  }
}

function exportOutput() {
  if (!view) return;
  try {
    const electron = require('electron');
    const dialog = (electron.remote && electron.remote.dialog) || electron.dialog;
    const result = dialog && dialog.showSaveDialogSync
      ? dialog.showSaveDialogSync({ defaultPath: path.join(process.cwd(), 'claude-workspace-output.txt') })
      : null;
    if (result) {
      fs.writeFileSync(result, view.outputText(), 'utf8');
      notify('Output exported', result);
    }
  } catch (error) {
    notifyError('Could not export output', error.message);
  }
}

function deleteSession() {
  const project = requireProject();
  const sessionId = view && view.selectedSessionId();
  if (!project || !sessionId) {
    notify('No session selected', 'Choose a saved Claude session first.');
    return;
  }
  store.removeSession(project.id, sessionId);
  refresh();
}

function renameSession() {
  const project = requireProject();
  const sessionId = view && view.selectedSessionId();
  if (!project || !sessionId) return notify('No session selected', 'Choose a saved Claude session first.');
  const session = project.claudeSessions.find(item => item.id === sessionId);
  const title = typeof window !== 'undefined' && window.prompt
    ? window.prompt('Session title', session && session.title || 'Claude session')
    : null;
  if (title && title.trim()) {
    store.updateSession(project.id, sessionId, { title: title.trim() });
    refresh();
  }
}

function clearSessions() {
  const project = requireProject();
  if (!project || !project.claudeSessions.length) return notify('No session history', 'There are no saved sessions for this project.');
  const confirmed = typeof window === 'undefined' || !window.confirm || window.confirm('Delete all saved session indexes for this project?');
  if (!confirmed) return;
  project.claudeSessions.slice().forEach(session => store.removeSession(project.id, session.id));
  refresh();
}

function removeProject() {
  const project = requireProject();
  if (!project) return;
  processes.stopClaude(project.id);
  processes.stopDevServer(project.id);
  if (atom.project && typeof atom.project.removePath === 'function') atom.project.removePath(project.path);
  store.remove(project.id);
  refresh();
}

function handleProcessEvent(event) {
  if (!view) return;
  if (event.type === 'session' && event.sessionId) {
    store.addSession(event.projectId, { id: event.sessionId, title: currentPrompt || 'Claude session' });
    refresh();
  }
  if (event.type === 'url' && event.url) {
    view.showPreview(event.url);
    processes.probeUrl(event.projectId, event.url);
  }
  if (event.source === 'terminal' && event.type === 'output') view.writeTerminal(event.terminalId, event.text);
  if (event.text && !(event.source === 'terminal' && event.type === 'output')) view.appendOutput(event.source, event.text);
  if (event.type === 'started') {
    if (event.source === 'terminal') {
      activeTerminalId = event.terminalId;
      view.setTerminals(processes.terminalIds(event.projectId), activeTerminalId);
    }
    const label = event.source === 'claude' ? 'Claude running' : event.source === 'terminal' ? 'Interactive Claude running' : 'Dev server starting';
    view.setStatus(label, 'running');
    refresh();
  }
  if (event.type === 'error') {
    view.setStatus('Error', 'error');
    atom.notifications.addError(`${event.source} failed`, { detail: event.text, dismissable: true });
  }
  if (event.type === 'health') {
    view.setStatus(event.ok ? `Preview online (${event.statusCode})` : 'Preview offline', event.ok ? 'running' : 'error');
    if (!event.ok && event.text) atom.notifications.addWarning('Preview is not reachable', { detail: event.text });
  }
  if (event.type === 'timeout') {
    view.setStatus('Dev server URL not detected', 'error');
    atom.notifications.addWarning('Dev server started without a detected URL', { detail: event.text, dismissable: true });
  }
  if (event.type === 'exit') {
    if (event.source === 'terminal') view.setTerminals(processes.terminalIds(event.projectId), activeTerminalId);
    view.setStatus('Stopped', 'stopped');
    refresh();
  }
}

function notify(title, detail) { atom.notifications.addInfo(title, { detail }); }
function notifyError(title, detail) { atom.notifications.addError(title, { detail, dismissable: true }); }

function deactivate() {
  if (subscriptions) subscriptions.dispose();
  if (statusTile) statusTile.destroy();
  if (panel) panel.destroy();
  if (processes) processes.dispose();
}

module.exports = { activate, consumeStatusBar, deactivate };
