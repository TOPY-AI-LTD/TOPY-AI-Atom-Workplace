class WorkspaceView {
  constructor({ onProjectChange, onAction, onPromptChange, maxOutputChars }) {
    this.onAction = onAction || (() => {});
    this.onPromptChange = onPromptChange || (() => {});
    this.maxOutputChars = maxOutputChars || 500000;
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
          <button class="btn" data-action="start-terminal">Interactive Claude</button>
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
        <button class="btn" data-action="send-terminal-input">Send input</button>
        <button class="btn" data-action="stop-terminal">Stop terminal</button>
        <button class="btn" data-action="delete-session">Delete session</button>
        <button class="btn" data-action="clear-output">Clear output</button>
        <select class="claude-workspace__log-filter" title="Filter output">
          <option value="all">All output</option>
          <option value="claude">Claude only</option>
          <option value="dev">Dev server only</option>
        </select>
        <button class="btn" data-action="copy-output">Copy output</button>
        <button class="btn" data-action="export-output">Export output</button>
      </section>
      <div class="claude-workspace__body">
        <div class="claude-workspace__console">
          <pre class="claude-workspace__output">Select a project to begin.</pre>
          <div class="claude-workspace__terminalbar" hidden>
            <label for="claude-workspace-terminals">Terminal</label>
            <select id="claude-workspace-terminals" class="claude-workspace__terminals"></select>
          </div>
          <div class="claude-workspace__terminal" hidden></div>
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
    this.terminalBar = this.element.querySelector('.claude-workspace__terminalbar');
    this.terminals = this.element.querySelector('.claude-workspace__terminals');
    this.terminal = this.element.querySelector('.claude-workspace__terminal');
    this.terminalViews = new Map();
    this.logFilter = this.element.querySelector('.claude-workspace__log-filter');
    this.outputEntries = [];
    this.preview = this.element.querySelector('.claude-workspace__preview');
    this.previewEmpty = this.element.querySelector('.claude-workspace__preview-empty');
    this.status = this.element.querySelector('.claude-workspace__status');
    this.statusLabel = this.element.querySelector('.claude-workspace__status-label');
    this.projects.addEventListener('change', event => onProjectChange(event.target.value));
    this.prompt.addEventListener('input', event => this.onPromptChange(event.target.value));
    this.prompt.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) this.onAction('start-session');
    });
    this.logFilter.addEventListener('change', event => this.renderOutput(event.target.value));
    this.terminals.addEventListener('change', event => this.showTerminal(event.target.value));
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

  setTerminals(ids, activeId) {
    const values = ids || [];
    this.terminalBar.hidden = values.length === 0;
    this.terminals.innerHTML = values.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
    if (activeId && values.includes(activeId)) this.terminals.value = activeId;
    if (values.length) this.showTerminal(this.terminals.value || values[values.length - 1]);
  }

  activeTerminalId() { return this.terminals.value || null; }

  showTerminal(id) {
    if (!id) return;
    this.terminal.hidden = false;
    let terminalView = this.terminalViews.get(id);
    if (!terminalView) {
      const host = document.createElement('div');
      host.className = 'claude-workspace__terminal-view';
      this.terminal.appendChild(host);
      try {
        const Terminal = require('xterm').Terminal || require('xterm');
        const instance = new Terminal({ convertEol: true, cursorBlink: true, scrollback: 5000 });
        instance.open(host);
        terminalView = { instance, host };
      } catch (error) {
        const pre = document.createElement('pre');
        pre.className = 'claude-workspace__terminal-fallback';
        host.appendChild(pre);
        terminalView = { pre, host };
      }
      this.terminalViews.set(id, terminalView);
    }
    this.terminalViews.forEach(view => { view.host.hidden = view !== terminalView; });
    this.terminal.dataset.activeId = id;
  }

  writeTerminal(id, text) {
    if (!id) return;
    this.showTerminal(id);
    const terminalView = this.terminalViews.get(id);
    if (terminalView.instance) terminalView.instance.write(text);
    else terminalView.pre.textContent = `${terminalView.pre.textContent}${text}`.slice(-this.maxOutputChars);
  }

  appendOutput(source, text) {
    const label = source === 'claude' ? 'Claude' : source === 'dev' ? 'Dev server' : source;
    this.outputEntries.push({ source, text: `[${label}] ${text}` });
    let total = this.outputEntries.reduce((size, entry) => size + entry.text.length, 0);
    while (total > this.maxOutputChars * 2 && this.outputEntries.length > 1) {
      total -= this.outputEntries.shift().text.length;
    }
    this.renderOutput(this.logFilter.value);
  }

  renderOutput(filter) {
    const selected = filter || 'all';
    const entries = selected === 'all' ? this.outputEntries : this.outputEntries.filter(entry => entry.source === selected);
    this.output.textContent = entries.map(entry => entry.text).join('\n');
    if (this.output.textContent.length > this.maxOutputChars) {
      this.output.textContent = this.output.textContent.slice(-this.maxOutputChars);
      this.output.textContent = `[output truncated to ${this.maxOutputChars} characters]\n${this.output.textContent}`;
    }
    this.output.scrollTop = this.output.scrollHeight;
  }

  clearOutput() { this.outputEntries = []; this.output.textContent = ''; }

  copyOutput() {
    if (typeof atom !== 'undefined' && atom.clipboard) atom.clipboard.write(this.outputText());
  }

  outputText() { return this.output.textContent; }

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
