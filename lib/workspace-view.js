class WorkspaceView {
  constructor({ onProjectChange, onAction }) {
    this.onAction = onAction;
    this.element = document.createElement('div');
    this.element.className = 'claude-workspace';
    this.element.innerHTML = `
      <div class="claude-workspace__toolbar">
        <select class="claude-workspace__projects"></select>
        <button data-action="new-project">New project</button>
        <button data-action="start-session">Start Claude</button>
        <button data-action="start-dev-server">Start dev</button>
        <button data-action="stop-dev-server">Stop dev</button>
        <button data-action="open-preview">Preview</button>
      </div>
      <div class="claude-workspace__body">
        <pre class="claude-workspace__output">Select a project to begin.</pre>
        <iframe class="claude-workspace__preview" title="Local development preview" hidden></iframe>
      </div>`;
    this.projects = this.element.querySelector('.claude-workspace__projects');
    this.output = this.element.querySelector('.claude-workspace__output');
    this.preview = this.element.querySelector('.claude-workspace__preview');
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
  }

  showPreview(url) {
    this.preview.hidden = false;
    this.preview.src = url;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
}

module.exports = WorkspaceView;
