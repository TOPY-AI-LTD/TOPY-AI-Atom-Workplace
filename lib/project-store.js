const fs = require('fs');
const path = require('path');

class ProjectStore {
  constructor(configDir) {
    this.filePath = path.join(configDir, 'claude-workspace.json');
    this.state = { projects: [], activeProjectId: null };
    this.load();
  }

  load() {
    try {
      this.state = Object.assign(this.state, JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('[claude-workspace] Could not load state:', error);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  all() { return this.state.projects; }

  active() {
    return this.state.projects.find(project => project.id === this.state.activeProjectId) || null;
  }

  upsert(project) {
    const existing = this.state.projects.findIndex(item => item.id === project.id);
    if (existing === -1) this.state.projects.push(project);
    else this.state.projects[existing] = Object.assign({}, this.state.projects[existing], project);
    this.state.activeProjectId = project.id;
    this.save();
    return project;
  }

  setActive(id) {
    this.state.activeProjectId = id;
    this.save();
    return this.active();
  }
}

module.exports = ProjectStore;
