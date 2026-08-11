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

function activate() {
  store = new ProjectStore(atom.getConfigDirPath());
  processes = new ProcessManager(handleProcessEvent, {
    claudeCommand: atom.config.get('claude-workspace.claudeCommand') || 'claude'
  });
  subscriptions = atom.commands.add('atom-workspace', {
    'claude-workspace:toggle': toggle,
    'claude-workspace:select-project': selectProject,
    'claude-workspace:new-project': newProject,
    'claude-workspace:start-session': startSession,
    'claude-workspace:resume-session': resumeSession,
    'claude-workspace:start-dev-server': startDevServer,
    'claude-workspace:stop-dev-server': stopDevServer,
    'claude-workspace:open-preview': openPreview,
    'claude-workspace:refresh-preview': refreshPreview,
    'claude-workspace:open-external-preview': openExternalPreview,
    'claude-workspace:clear-output': clearOutput,
    'claude-workspace:remove-project': removeProject
  });
}

function consumeStatusBar(statusBar) {
  const button = document.createElement('button');
  button.className = 'inline-block-tight';
  button.textContent = 'Claude Workspace';
  button.addEventListener('click', toggle);
  statusTile = statusBar.addLeftTile({ item: button, priority: 100 });
}

function createView() {
  view = new WorkspaceView({
    maxOutputChars: atom.config.get('claude-workspace.maxOutputChars') || 500000,
    onProjectChange: id => { store.setActive(id); currentPrompt = ''; refresh(); },
    onPromptChange: prompt => { currentPrompt = prompt; },
    onAction: action => ({
      'new-project': newProject,
      'start-session': startSession,
      'resume-session': resumeSession,
      'start-dev-server': startDevServer,
      'stop-dev-server': stopDevServer,
      'open-preview': openPreview,
      'refresh-preview': refreshPreview,
      'open-external-preview': openExternalPreview,
      'clear-output': clearOutput,
      'remove-project': removeProject
    }[action] || (() => {}))()
  });
  return view;
}

function showPanel() {
  if (!panel) {
    createView();
    panel = atom.workspace.addBottomPanel({ item: view.element, visible: true, priority: 100 });
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
  view.setProjects(store.all(), active && active.id);
  view.setSessions(active ? active.claudeSessions : [], view.selectedSessionId());
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
  const project = store.upsert(ProjectStore.defaultProject(projectPath));
  atom.project.addPath(project.path);
  showPanel();
  return project;
}

async function selectProject() {
  registerProject(await chooseDirectory());
}

async function newProject() {
  const project = registerProject(await chooseDirectory());
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
  const sessionId = view && view.selectedSessionId();
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

function removeProject() {
  const project = requireProject();
  if (!project) return;
  processes.stopClaude(project.id);
  processes.stopDevServer(project.id);
  store.remove(project.id);
  refresh();
}

function handleProcessEvent(event) {
  if (!view) return;
  if (event.type === 'session' && event.sessionId) {
    store.addSession(event.projectId, { id: event.sessionId, title: currentPrompt || 'Claude session' });
    refresh();
  }
  if (event.type === 'url' && event.url) view.showPreview(event.url);
  if (event.text) view.appendOutput(event.source, event.text);
  if (event.type === 'started') view.setStatus(event.source === 'claude' ? 'Claude running' : 'Dev server starting', 'running');
  if (event.type === 'error') {
    view.setStatus('Error', 'error');
    atom.notifications.addError(`${event.source} failed`, { detail: event.text, dismissable: true });
  }
  if (event.type === 'exit') view.setStatus('Stopped', 'stopped');
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
