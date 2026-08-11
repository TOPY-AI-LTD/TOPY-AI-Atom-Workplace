class WorkspaceView {
  constructor({ onProjectChange, onAction }) {
    this.onAction = onAction;
    this.element = document.createElement('div');
    this.element.className = 'claude-workspace';
    this.element.innerHTML = `
      <header class="claude-workspace__header">
        <div class="claude-workspace__brand">
          <span class="claude-workspace__logo">✦</span>
          <div>
            <div class="claude-workspace__title">Claude Workspace</div>
            <div class="claude-workspace__subtitle">Projects · Claude Code · Local Preview</div>
          </div>
        </div>
        <div class="claude-workspace__status" data-status="ready">
          <span class="claude-workspace__status-dot"></span>
          <span class="claude-workspace__status-label">Ready</span>
        </div>
      </header>
      <nav class="claude-workspace__toolbar" aria-label="Claude Workspace controls">
        <div class="claude-workspace__project-group">
          <label for="claude-workspace-projects">Project</label>
          <select id="claude-workspace-projects" class="claude-workspace__projects"></select>
        </div>
        <div class="claude-workspace__actions">
          <button class="btn" data-action="new-project">New project</button>
          <button class="btn btn-primary" data-action="start-session">Start Claude</button>
          <button class="btn" data-action="start-dev-server">Start dev</button>
          <button class="btn" data-action="stop-dev-server">Stop dev</button>
          <button class="btn" data-action="open-preview">Preview</button>
        </div>
      </div>
      <div class="claude-workspace__body">
        <pre class="claude-workspace__output">Select a project to begin.</pre>
        <iframe class="claude-workspace__preview" title="Local development preview" hidden></iframe>
      </div>`;
    this.projects = this.element.querySelector('.claude-workspace__projects');
    this.output = this.element.querySelector('.claude-workspace__output');
    this.preview = this.element.querySelector('.claude-workspace__preview');
    this.status = this.element.querySelector('.claude-workspace__status');
    this.statusLabel = this.element.querySelector('.claude-workspace__status-label');
    this.projects.addEventListener('change', event => onProjectChange(event.target.value));
    this.element.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => this.onAction(button.dataset.action));
    });
  }

  setProjects(projects, activeId) {
    this.projects.innerHTML = projects.map(project =>
      `<option value="${escapeHtml(project.id)}" ${project.id === activeId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`
    ).join('');
  }

  appendOutput(source, text) {
    const label = source === 'claude' ? 'Claude' : 'Dev server';
    this.output.textContent += `\n[${label}] ${text}`;
    this.output.scrollTop = this.output.scrollHeight;
    this.setStatus(source === 'claude' ? 'Claude running' : 'Dev server running', 'running');
  }

  showPreview(url) {
    this.preview.hidden = false;
    this.preview.src = url;
    this.setStatus('Preview open', 'running');
  }

  setStatus(label, state) {
    this.status.dataset.status = state;
    this.statusLabel.textContent = label;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

module.exports = WorkspaceView;
