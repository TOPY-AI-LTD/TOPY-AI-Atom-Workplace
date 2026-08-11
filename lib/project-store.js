const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CURRENT_VERSION = 1;

function projectId(projectPath) {
  const normalized = path.resolve(projectPath);
  const slug = path.basename(normalized).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'project';
  const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  return `${slug}-${digest}`;
}

function defaultProject(projectPath, overrides) {
  const resolvedPath = path.resolve(projectPath);
  return Object.assign({
    id: projectId(resolvedPath),
    name: path.basename(resolvedPath) || resolvedPath,
    path: resolvedPath,
    packageManager: null,
    devCommand: null,
    devPort: 3000,
    lastUsedAt: null,
    claudeSessions: []
  }, overrides || {});
}

class ProjectStore {
  constructor(configDir, options) {
    this.fs = (options && options.fs) || fs;
    this.filePath = path.join(configDir, 'claude-workspace.json');
    this.state = { version: CURRENT_VERSION, projects: [], activeProjectId: null };
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
      this.state = this.normalize(parsed);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      this.backupCorruptFile();
      console.error('[claude-workspace] Could not load state:', error);
    }
  }

  normalize(value) {
    const projects = Array.isArray(value && value.projects) ? value.projects : [];
    return {
      version: CURRENT_VERSION,
      projects: projects.filter(project => project && project.path).map(project => defaultProject(project.path, project)),
      activeProjectId: value && value.activeProjectId ? value.activeProjectId : null
    };
  }

  backupCorruptFile() {
    try {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      this.fs.copyFileSync(this.filePath, backup);
    } catch (backupError) {
      console.error('[claude-workspace] Could not back up corrupt state:', backupError);
    }
  }

  save() {
    const directory = path.dirname(this.filePath);
    this.fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    this.fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2));
    this.fs.renameSync(temporaryPath, this.filePath);
  }

  all() { return this.state.projects.slice(); }

  active() {
    return this.state.projects.find(project => project.id === this.state.activeProjectId) || null;
  }

  get(id) { return this.state.projects.find(project => project.id === id) || null; }

  upsert(project) {
    const normalized = defaultProject(project.path, project);
    const existing = this.state.projects.findIndex(item => item.id === normalized.id);
    if (existing === -1) this.state.projects.push(normalized);
    else this.state.projects[existing] = Object.assign({}, this.state.projects[existing], normalized);
    this.state.activeProjectId = normalized.id;
    this.touch(normalized.id);
    this.save();
    return this.get(normalized.id);
  }

  setActive(id) {
    if (!this.get(id)) return null;
    this.state.activeProjectId = id;
    this.touch(id);
    this.save();
    return this.active();
  }

  touch(id) {
    const project = this.get(id);
    if (project) project.lastUsedAt = new Date().toISOString();
  }

  remove(id) {
    const index = this.state.projects.findIndex(project => project.id === id);
    if (index === -1) return false;
    this.state.projects.splice(index, 1);
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = this.state.projects[0] ? this.state.projects[0].id : null;
    }
    this.save();
    return true;
  }

  addSession(projectIdValue, session) {
    const project = this.get(projectIdValue);
    if (!project || !session || !session.id) return null;
    const index = project.claudeSessions.findIndex(item => item.id === session.id);
    const record = Object.assign({
      id: session.id,
      title: session.title || 'Claude session',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    }, session);
    if (index === -1) project.claudeSessions.unshift(record);
    else project.claudeSessions[index] = Object.assign({}, project.claudeSessions[index], record, { lastUsedAt: new Date().toISOString() });
    this.touch(projectIdValue);
    this.save();
    return record;
  }

  updateSession(projectIdValue, sessionId, patch) {
    const project = this.get(projectIdValue);
    if (!project) return null;
    const session = project.claudeSessions.find(item => item.id === sessionId);
    if (!session) return null;
    Object.assign(session, patch || {}, { lastUsedAt: new Date().toISOString() });
    this.save();
    return session;
  }

  removeSession(projectIdValue, sessionId) {
    const project = this.get(projectIdValue);
    if (!project) return false;
    const before = project.claudeSessions.length;
    project.claudeSessions = project.claudeSessions.filter(session => session.id !== sessionId);
    if (project.claudeSessions.length === before) return false;
    this.save();
    return true;
  }
}

ProjectStore.projectId = projectId;
ProjectStore.defaultProject = defaultProject;
module.exports = ProjectStore;
