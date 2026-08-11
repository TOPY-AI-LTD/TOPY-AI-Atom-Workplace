const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function detectPackageManager(projectPath, fileSystem) {
  const exists = file => fileSystem.existsSync(path.join(projectPath, file));
  if (exists('pnpm-lock.yaml')) return { name: 'pnpm', bin: 'pnpm', args: ['dev'] };
  if (exists('yarn.lock')) return { name: 'yarn', bin: 'yarn', args: ['dev'] };
  return { name: 'npm', bin: 'npm', args: ['run', 'dev'] };
}

function hasDevScript(projectPath, fileSystem) {
  try {
    const packageJson = JSON.parse(fileSystem.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
    return Boolean(packageJson.scripts && packageJson.scripts.dev);
  } catch (error) {
    return false;
  }
}

function parseLocalUrl(text) {
  const explicit = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i);
  if (explicit) return explicit[0];
  const port = text.match(/(?:localhost|127\.0\.0\.1)[: ](\d+)/i);
  return port ? `http://localhost:${port[1]}` : null;
}

function extractJsonLines(buffer) {
  const lines = buffer.split(/\r?\n/);
  return { complete: lines.slice(0, -1), remainder: lines[lines.length - 1] };
}

function textFromClaudeEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (typeof event.result === 'string') return event.result;
  if (typeof event.message === 'string') return event.message;
  const content = event.message && event.message.content;
  if (Array.isArray(content)) return content.filter(item => item && item.type === 'text').map(item => item.text).join('');
  if (event.delta && typeof event.delta.text === 'string') return event.delta.text;
  return '';
}

class ProcessManager {
  constructor(onEvent, options) {
    this.onEvent = onEvent || (() => {});
    this.fs = (options && options.fs) || fs;
    this.spawn = (options && options.spawn) || spawn;
    this.claudeCommand = (options && options.claudeCommand) || 'claude';
    this.processes = new Map();
    this.devUrls = new Map();
    this.claudeBuffers = new Map();
    this.devBuffers = new Map();
  }

  emit(event) { this.onEvent(Object.assign({ timestamp: new Date().toISOString() }, event)); }

  runClaude(projectId, projectPath, prompt, sessionId) {
    this.stopClaude(projectId);
    const args = ['-p'];
    if (sessionId) args.push('--resume', sessionId);
    args.push('--output-format', 'stream-json', '--verbose', prompt);
    let child;
    try {
      child = this.spawn(this.claudeCommand, args, { cwd: projectPath, shell: false });
    } catch (error) {
      this.emit({ type: 'error', source: 'claude', projectId, text: error.message, error });
      return null;
    }
    this.processes.set(`claude:${projectId}`, child);
    this.claudeBuffers.set(projectId, '');
    this.emit({ type: 'started', source: 'claude', projectId, sessionId });
    this.attach(child, 'claude', projectId);
    return child;
  }

  startDevServer(projectId, projectPath, configuredCommand) {
    this.stopDevServer(projectId);
    if (!hasDevScript(projectPath, this.fs) && !configuredCommand) {
      const error = new Error('package.json does not define a dev script');
      this.emit({ type: 'error', source: 'dev', projectId, text: error.message, error });
      return null;
    }
    const detected = detectPackageManager(projectPath, this.fs);
    const command = configuredCommand ? { bin: configuredCommand.split(/\s+/)[0], args: configuredCommand.split(/\s+/).slice(1) } : detected;
    let child;
    try {
      child = this.spawn(command.bin, command.args, { cwd: projectPath, shell: false });
    } catch (error) {
      this.emit({ type: 'error', source: 'dev', projectId, text: error.message, error });
      return null;
    }
    this.processes.set(`dev:${projectId}`, child);
    this.devUrls.delete(projectId);
    this.devBuffers.set(projectId, '');
    this.emit({ type: 'started', source: 'dev', projectId, command: [command.bin].concat(command.args).join(' ') });
    this.attach(child, 'dev', projectId);
    return child;
  }

  attach(child, source, projectId) {
    if (child.stdout && child.stdout.on) child.stdout.on('data', data => this.handleOutput(source, projectId, data.toString()));
    if (child.stderr && child.stderr.on) child.stderr.on('data', data => this.handleOutput(source, projectId, data.toString()));
    child.on('error', error => this.emit({ type: 'error', source, projectId, text: error.message, error }));
    child.on('close', code => {
      if (source === 'claude') this.flushClaudeBuffer(projectId);
      this.processes.delete(`${source === 'claude' ? 'claude' : 'dev'}:${projectId}`);
      this.emit({ type: 'exit', source, projectId, code, text: `[process exited with code ${code}]` });
    });
  }

  flushClaudeBuffer(projectId) {
    const remainder = this.claudeBuffers.get(projectId);
    if (remainder && remainder.trim()) {
      try {
        const event = JSON.parse(remainder);
        if (event.session_id) this.emit({ type: 'session', source: 'claude', projectId, sessionId: event.session_id, event });
        const output = textFromClaudeEvent(event);
        if (output) this.emit({ type: 'output', source: 'claude', projectId, text: output, event });
      } catch (error) {
        this.emit({ type: 'output', source: 'claude', projectId, text: remainder });
      }
    }
    this.claudeBuffers.delete(projectId);
  }

  handleOutput(source, projectId, text) {
    if (source === 'dev') {
      const url = parseLocalUrl(text);
      if (url) {
        this.devUrls.set(projectId, url);
        this.emit({ type: 'url', source, projectId, url, text });
      }
      this.emit({ type: 'output', source, projectId, text, url: this.devUrls.get(projectId) || null });
      return;
    }

    let buffer = `${this.claudeBuffers.get(projectId) || ''}${text}`;
    const parsed = extractJsonLines(buffer);
    this.claudeBuffers.set(projectId, parsed.remainder);
    let parsedAny = false;
    parsed.complete.forEach(line => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        parsedAny = true;
        if (event.session_id) this.emit({ type: 'session', source, projectId, sessionId: event.session_id, event });
        const output = textFromClaudeEvent(event);
        if (output) this.emit({ type: 'output', source, projectId, text: output, event });
      } catch (error) {
        this.emit({ type: 'output', source, projectId, text: line });
      }
    });
    if (!parsedAny && text.trim()) this.emit({ type: 'output', source, projectId, text });
  }

  stopProcess(source, projectId) {
    const key = `${source}:${projectId}`;
    const child = this.processes.get(key);
    if (!child) return false;
    try { child.kill('SIGTERM'); } catch (error) { this.emit({ type: 'error', source, projectId, text: error.message, error }); }
    this.processes.delete(key);
    this.emit({ type: 'stopped', source, projectId });
    return true;
  }

  stopClaude(projectId) { return this.stopProcess('claude', projectId); }
  stopDevServer(projectId) { return this.stopProcess('dev', projectId); }
  url(projectId) { return this.devUrls.get(projectId) || null; }
  isRunning(source, projectId) { return this.processes.has(`${source}:${projectId}`); }

  dispose() {
    Array.from(this.processes.keys()).forEach(key => {
      const [source, projectId] = key.split(':');
      this.stopProcess(source, projectId);
    });
    this.processes.clear();
  }
}

ProcessManager.detectPackageManager = detectPackageManager;
ProcessManager.parseLocalUrl = parseLocalUrl;
ProcessManager.textFromClaudeEvent = textFromClaudeEvent;
module.exports = ProcessManager;
