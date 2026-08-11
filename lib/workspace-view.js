class WorkspaceView {
  constructor({ onProjectChange, onAction, onPromptChange }) {
    this.onAction = onAction || (() => {});
    this.onPromptChange = onPromptChange || (() => {});
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
          <button class="btn" data-action="remove-project" title="Remove project from Claude Workspace">Remove</button>
        </div>
        <div class="claude-workspace__actions">
          <button class="btn" data-action="new-project">New project</button>
          <button class="btn btn-primary" data-action="start-session">Start Claude</button>
          <button class="btn" data-action="start-dev-server">Start dev</button>
          <button class="btn" data-action="stop-dev-server">Stop dev</button>
          <button class="btn" data-action="open-preview">Preview</button>
        </div>
      </nav>
      <section class="claude-workspace__sessionbar">
        <label for="claude-workspace-sessions">Session</label>
        <select id="claude-workspace-sessions" class="claude-workspace__sessions">
          <option value="">New session</option>
        </select>
        <input class="claude-workspace__prompt" type="text" placeholder="Ask Claude about this project..." />
        <button class="btn" data-action="resume-session">Resume</button>
        <button class="btn" data-action="clear-output">Clear output</button>
      </section>
      <div class="claude-workspace__body">
        <div class="claude-workspace__console">
          <pre class="claude-workspace__output">Select a project to begin.</pre>
        </div>
        <div class="claude-workspace__preview-wrap">
          <div class="claude-workspace__previewbar">
            <span>Local preview</span>
            <button class="btn btn-sm" data-action="refresh-preview">Refresh</button>
            <button class="btn btn-sm" data-action="open-external-preview">External browser</button>
          </div>
          <iframe class="claude-workspace__preview" title="Local development preview" hidden></iframe>
          <div class="claude-workspace__preview-empty">Start a dev server to preview your app.</div>
        </div>
      </div>`;
    this.projects = this.element.querySelector('.claude-workspace__projects');
    this.sessions = this.element.querySelector('.claude-workspace__sessions');
    this.prompt = this.element.querySelector('.claude-workspace__prompt');
    this.output = this.element.querySelector('.claude-workspace__output');
    this.preview = this.element.querySelector('.claude-workspace__preview');
    this.previewEmpty = this.element.querySelector('.claude-workspace__preview-empty');
    this.status = this.element.querySelector('.claude-workspace__status');
    this.statusLabel = this.element.querySelector('.claude-workspace__status-label');
    this.projects.addEventListener('change', event => onProjectChange(event.target.value));
    this.prompt.addEventListener('input', event => this.onPromptChange(event.target.value));
    this.prompt.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) this.onAction('start-session');
    });
    this.element.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => this.onAction(button.dataset.action));
    });
  }

  setProjects(projects, activeId) {
    this.projects.innerHTML = projects.length
      ? projects.map(project => `<option value="${escapeHtml(project.id)}" ${project.id === activeId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')
      : '<option value="">No projects yet</option>';
  }

  setSessions(sessions, selectedId) {
    this.sessions.innerHTML = '<option value="">New session</option>' + (sessions || []).map(session =>
      `<option value="${escapeHtml(session.id)}" ${session.id === selectedId ? 'selected' : ''}>${escapeHtml(session.title || session.id)}</option>`
    ).join('');
  }

  selectedSessionId() { return this.sessions.value || null; }
  promptText() { return this.prompt.value.trim(); }

  appendOutput(source, text) {
    const label = source === 'claude' ? 'Claude' : source === 'dev' ? 'Dev server' : source;
    this.output.textContent += `\n[${label}] ${text}`;
    this.output.scrollTop = this.output.scrollHeight;
  }

  clearOutput() { this.output.textContent = ''; }

  showPreview(url) {
    this.preview.hidden = false;
    this.previewEmpty.hidden = true;
    this.preview.src = url;
    this.preview.dataset.url = url;
    this.setStatus('Preview open', 'running');
  }

  refreshPreview() {
    if (this.preview.dataset.url) this.preview.src = this.preview.dataset.url;
  }

  previewUrl() { return this.preview.dataset.url || null; }

  setStatus(label, state) {
    this.status.dataset.status = state;
    this.statusLabel.textContent = label;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

module.exports = WorkspaceView;
