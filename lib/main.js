const path = require('path');
const fs = require('fs');
const ProjectStore = require('./project-store');
const ProcessManager = require('./process-manager');
const WorkspaceView = require('./workspace-view');

let store;
let processes;
let view;
let panel;
let subscriptions;

function activate() {
  store = new ProjectStore(atom.getConfigDirPath());
  processes = new ProcessManager(event => {
    if (view) view.appendOutput(event.source, event.text);
    if (event.url && view) view.showPreview(event.url);
  });
  subscriptions = atom.commands.add('atom-workspace', {
    'claude-workspace:toggle': toggle,
    'claude-workspace:select-project': selectProject,
    'claude-workspace:new-project': newProject,
    'claude-workspace:start-session': startSession,
    'claude-workspace:start-dev-server': startDevServer,
    'claude-workspace:stop-dev-server': stopDevServer,
    'claude-workspace:open-preview': openPreview
  });
}

function consumeStatusBar(statusBar) {
  const button = document.createElement('button');
  button.className = 'inline-block-tight';
  button.textContent = 'Claude Workspace';
  button.addEventListener('click', toggle);
  statusBar.addLeftTile({ item: button, priority: 100 });
}

function toggle() {
  if (!panel) {
    view = new WorkspaceView({
      onProjectChange: id => { store.setActive(id); refresh(); },
      onAction: action => ({
        'new-project': newProject,
        'start-session': startSession,
        'start-dev-server': startDevServer,
        'stop-dev-server': stopDevServer,
        'open-preview': openPreview
      }[action] || (() => {}))()
    });
    panel = atom.workspace.addBottomPanel({ item: view.element, visible: true, priority: 100 });
    refresh();
  } else {
    panel.isVisible() ? panel.hide() : panel.show();
  }
}

function refresh() {
  if (view) view.setProjects(store.all(), store.active() && store.active().id);
}

async function chooseDirectory() {
  if (typeof atom.pickFolder === 'function') {
    const paths = await atom.pickFolder();
    return paths && paths[0];
  }
  return null;
}

async function selectProject() {
  const projectPath = await chooseDirectory();
  if (!projectPath) return;
  const project = makeProject(projectPath);
  store.upsert(project);
  atom.project.addPath(projectPath);
  refresh();
  toggle();
}

async function newProject() {
  const projectPath = await chooseDirectory();
  if (!projectPath) return;
  fs.mkdirSync(projectPath, { recursive: true });
  await selectExistingProject(projectPath);
}

async function selectExistingProject(projectPath) {
  const project = makeProject(projectPath);
  store.upsert(project);
  atom.project.addPath(projectPath);
  refresh();
  toggle();
}

function makeProject(projectPath) {
  return {
    id: projectPath.replace(/[^a-zA-Z0-9_-]/g, '-'),
    name: path.basename(projectPath),
    path: projectPath,
    devPort: 3000,
    claudeSessions: []
  };
}

function requireProject() {
  const project = store.active();
  if (!project) atom.notifications.addWarning('Select a project first.');
  return project;
}

function startSession() {
  const project = requireProject();
  if (!project) return;
  processes.runClaude(project.path, 'Inspect this project. Explain the stack and how to start the local development server.');
}

function startDevServer() {
  const project = requireProject();
  if (!project) return;
  processes.startDevServer(project.path);
}

function stopDevServer() { processes.stopDevServer(); }

function openPreview() {
  const project = requireProject();
  if (!project) return;
  const url = processes.devUrl || `http://localhost:${project.devPort || 3000}`;
  if (!panel) toggle();
  view.showPreview(url);
}

function deactivate() {
  if (subscriptions) subscriptions.dispose();
  if (panel) panel.destroy();
  if (processes) processes.dispose();
}

module.exports = { activate, consumeStatusBar, deactivate };
