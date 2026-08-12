const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, spawnSync } = require('child_process');

let nodePty = null;
try {
  const ptyRoot = path.join(__dirname, '..', 'node_modules', 'node-pty', 'build');
  const nativePty = ['Release/pty.node', 'Debug/pty.node'].some(file => fs.existsSync(path.join(ptyRoot, file)));
  if (nativePty) nodePty = require('node-pty');
} catch (error) { nodePty = null; }

function detectPackageManager(projectPath, fileSystem) {
  const exists = file => fileSystem.existsSync(path.join(projectPath, file));
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  if (exists('pnpm-lock.yaml')) return { name: 'pnpm', bin: `pnpm${suffix}`, args: ['dev'] };
  if (exists('yarn.lock')) return { name: 'yarn', bin: `yarn${suffix}`, args: ['dev'] };
  return { name: 'npm', bin: `npm${suffix}`, args: ['run', 'dev'] };
}

function hasDevScript(projectPath, fileSystem) {
  try {
    const packageJson = JSON.parse(fileSystem.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
    return Boolean(packageJson.scripts && packageJson.scripts.dev);
  } catch (error) {
    return false;
  }
}

function detectProjectProfile(projectPath, fileSystem) {
  let localConfig = {};
  try { localConfig = JSON.parse(fileSystem.readFileSync(path.join(projectPath, '.claude-workspace.json'), 'utf8')); } catch (error) { /* optional project config */ }
  try {
    const packageJson = JSON.parse(fileSystem.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
    const dependencies = Object.assign({}, packageJson.dependencies, packageJson.devDependencies);
    const has = name => Boolean(dependencies[name]);
    let framework = 'node';
    if (has('next')) framework = 'nextjs';
    else if (has('vite')) framework = 'vite';
    else if (has('astro')) framework = 'astro';
    else if (has('nuxt')) framework = 'nuxt';
    else if (has('react')) framework = 'react';
    else if (has('vue')) framework = 'vue';
    const script = packageJson.scripts && packageJson.scripts.dev || '';
    const portMatch = script.match(/(?:--port|-p)[= ](\d+)/);
    const configFiles = ['next.config.js', 'next.config.mjs', 'vite.config.js', 'vite.config.ts', 'astro.config.mjs', 'nuxt.config.ts'];
    let configText = '';
    configFiles.forEach(file => {
      try { configText += `\n${fileSystem.readFileSync(path.join(projectPath, file), 'utf8')}`; } catch (error) { /* optional config */ }
    });
    const configPortMatch = configText.match(/(?:port|devPort)\s*[:=]\s*(\d{2,5})/);
    const defaultPorts = { vite: 5173, astro: 4321, nextjs: 3000, nuxt: 3000 };
    return {
      framework: localConfig.framework || framework,
      packageManager: localConfig.packageManager || detectPackageManager(projectPath, fileSystem).name,
      devCommand: localConfig.devCommand || null,
      devPort: Number(localConfig.devPort) || (portMatch ? Number(portMatch[1]) : configPortMatch ? Number(configPortMatch[1]) : defaultPorts[framework] || null)
    };
  } catch (error) {
    return { framework: localConfig.framework || 'unknown', packageManager: localConfig.packageManager || detectPackageManager(projectPath, fileSystem).name, devCommand: localConfig.devCommand || null, devPort: Number(localConfig.devPort) || null };
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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
    this.terminals = new Map();
    this.terminalCounter = 0;
    this.startupTimers = new Map();
    this.startupTimeoutMs = (options && options.startupTimeoutMs) || 15000;
  }

  gitStatus(projectPath) {
    try {
      const branch = spawnSync('git', ['-C', projectPath, 'branch', '--show-current'], { encoding: 'utf8' });
      const status = spawnSync('git', ['-C', projectPath, 'status', '--porcelain'], { encoding: 'utf8' });
      if (branch.error || status.error || branch.status !== 0) return null;
      return { branch: branch.stdout.trim() || 'detached', dirty: Boolean(status.stdout.trim()) };
    } catch (error) { return null; }
  }

  emit(event) { this.onEvent(Object.assign({ timestamp: new Date().toISOString() }, event)); }

  runClaude(projectId, projectPath, prompt, sessionId) {
    this.stopProcess('claude', projectId);
    const args = ['-p'];
    if (sessionId) args.push('--resume', sessionId);
    args.push('--output-format', 'stream-json', '--verbose', prompt);
    let child;
    try {
      child = this.spawn(this.claudeCommand, args, { cwd: projectPath, shell: false, detached: process.platform !== 'win32' });
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

  runInteractiveClaude(projectId, projectPath, terminalId, sessionId) {
    const id = terminalId || `terminal-${Date.now()}-${++this.terminalCounter}`;
    this.stopInteractiveClaude(projectId, id);
    if (nodePty) return this.runNodePty(projectId, projectPath, id, sessionId);
    return this.runFallbackTerminal(projectId, projectPath, id, sessionId);
  }

  profile(projectPath) { return detectProjectProfile(projectPath, this.fs); }

  runNodePty(projectId, projectPath, terminalId, sessionId) {
    let terminal;
    try {
      const args = sessionId ? ['--resume', sessionId] : [];
      terminal = nodePty.spawn(this.claudeCommand, args, {
        cwd: projectPath,
        name: 'xterm-color',
        cols: 120,
        rows: 32,
        env: Object.assign({}, process.env)
      });
    } catch (error) {
      this.emit({ type: 'error', source: 'terminal', projectId, terminalId, text: error.message, error });
      return null;
    }
    this.terminals.set(`${projectId}:${terminalId}`, { id: terminalId, projectId, terminal, pty: true });
    terminal.onData(data => this.emit({ type: 'output', source: 'terminal', projectId, terminalId, text: data }));
    terminal.onExit(event => {
      this.terminals.delete(`${projectId}:${terminalId}`);
      this.emit({ type: 'exit', source: 'terminal', projectId, terminalId, code: event.exitCode, text: `[terminal exited with code ${event.exitCode}]` });
    });
    this.emit({ type: 'started', source: 'terminal', projectId, terminalId, pty: true });
    return terminalId;
  }

  runFallbackTerminal(projectId, projectPath, terminalId, sessionId) {
    let child;
    try {
      if (process.platform === 'linux') {
        const command = [this.claudeCommand].concat(sessionId ? ['--resume', sessionId] : []).map(shellQuote).join(' ');
        child = this.spawn('script', ['-qefc', command, '/dev/null'], {
          cwd: projectPath,
          shell: false,
          detached: true
        });
      } else {
        child = this.spawn(this.claudeCommand, sessionId ? ['--resume', sessionId] : [], { cwd: projectPath, shell: false });
      }
    } catch (error) {
      this.emit({ type: 'error', source: 'terminal', projectId, terminalId, text: error.message, error });
      return null;
    }
    this.terminals.set(`${projectId}:${terminalId}`, { id: terminalId, projectId, child, pty: false });
    this.emit({ type: 'started', source: 'terminal', projectId, terminalId, pty: false });
    this.attach(child, 'terminal', projectId, terminalId);
    return terminalId;
  }

  sendInteractiveInput(projectId, input, terminalId, raw) {
    const record = this.terminals.get(`${projectId}:${terminalId}`) || this.latestTerminal(projectId);
    if (!record) return false;
    const value = raw ? input : input.endsWith('\n') ? input : `${input}\n`;
    if (record.pty) record.terminal.write(value);
    else if (record.child.stdin && record.child.stdin.write) record.child.stdin.write(value);
    else return false;
    return true;
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
      child = this.spawn(command.bin, command.args, { cwd: projectPath, shell: false, detached: process.platform !== 'win32' });
    } catch (error) {
      this.emit({ type: 'error', source: 'dev', projectId, text: error.message, error });
      return null;
    }
    this.processes.set(`dev:${projectId}`, child);
    this.devUrls.delete(projectId);
    this.devBuffers.set(projectId, '');
    const startupTimer = setTimeout(() => {
      if (!this.devUrls.has(projectId) && this.isRunning('dev', projectId)) {
        this.emit({ type: 'timeout', source: 'dev', projectId, text: `No local URL detected after ${this.startupTimeoutMs} ms` });
      }
    }, this.startupTimeoutMs);
    if (startupTimer.unref) startupTimer.unref();
    this.startupTimers.set(projectId, startupTimer);
    this.emit({ type: 'started', source: 'dev', projectId, command: [command.bin].concat(command.args).join(' ') });
    this.attach(child, 'dev', projectId);
    return child;
  }

  attach(child, source, projectId, terminalId) {
    if (child.stdout && child.stdout.on) child.stdout.on('data', data => this.handleOutput(source, projectId, data.toString(), terminalId));
    if (child.stderr && child.stderr.on) child.stderr.on('data', data => this.handleOutput(source, projectId, data.toString(), terminalId));
    child.on('error', error => this.emit({ type: 'error', source, projectId, terminalId, text: error.message, error }));
    child.on('close', code => {
      if (source === 'terminal') this.terminals.delete(`${projectId}:${terminalId}`);
      if (source === 'dev' && this.startupTimers.has(projectId)) {
        clearTimeout(this.startupTimers.get(projectId));
        this.startupTimers.delete(projectId);
      }
      if (source === 'claude') this.flushClaudeBuffer(projectId);
      this.processes.delete(`${source === 'claude' ? 'claude' : 'dev'}:${projectId}`);
      this.emit({ type: 'exit', source, projectId, terminalId, code, text: `[process exited with code ${code}]` });
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

  handleOutput(source, projectId, text, terminalId) {
    if (source === 'terminal') {
      this.emit({ type: 'output', source, projectId, terminalId, text });
      return;
    }
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
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch (error) { this.emit({ type: 'error', source, projectId, text: error.message, error }); }
    this.processes.delete(key);
    if (source === 'dev' && this.startupTimers.has(projectId)) {
      clearTimeout(this.startupTimers.get(projectId));
      this.startupTimers.delete(projectId);
    }
    this.emit({ type: 'stopped', source, projectId });
    return true;
  }

  latestTerminal(projectId) {
    const records = Array.from(this.terminals.values()).filter(record => record.projectId === projectId);
    return records[records.length - 1] || null;
  }

  stopClaude(projectId) {
    const stopped = this.stopProcess('claude', projectId);
    const terminalStopped = Array.from(this.terminals.values())
      .filter(record => record.projectId === projectId)
      .map(record => this.stopInteractiveClaude(projectId, record.id))
      .some(Boolean);
    return terminalStopped || stopped;
  }
  stopInteractiveClaude(projectId, terminalId) {
    const record = terminalId ? this.terminals.get(`${projectId}:${terminalId}`) : this.latestTerminal(projectId);
    if (!record) return false;
    try {
      if (record.pty) record.terminal.kill();
      else if (record.child.pid && process.platform !== 'win32') process.kill(-record.child.pid, 'SIGTERM');
      else record.child.kill('SIGTERM');
    } catch (error) {
      this.emit({ type: 'error', source: 'terminal', projectId, terminalId: record.id, text: error.message, error });
    }
    this.terminals.delete(`${projectId}:${record.id}`);
    this.emit({ type: 'stopped', source: 'terminal', projectId, terminalId: record.id });
    return true;
  }
  interruptInteractiveClaude(projectId, terminalId) {
    const record = terminalId ? this.terminals.get(`${projectId}:${terminalId}`) : this.latestTerminal(projectId);
    if (!record) return false;
    try {
      if (record.pty) record.terminal.write('\u0003');
      else if (record.child.pid && process.platform !== 'win32') process.kill(-record.child.pid, 'SIGINT');
      else record.child.kill('SIGINT');
    } catch (error) {
      this.emit({ type: 'error', source: 'terminal', projectId, terminalId: record.id, text: error.message, error });
      return false;
    }
    this.emit({ type: 'interrupt', source: 'terminal', projectId, terminalId: record.id, text: '[sent Ctrl-C]' });
    return true;
  }
  terminalIds(projectId) { return Array.from(this.terminals.values()).filter(record => record.projectId === projectId).map(record => record.id); }
  stopDevServer(projectId) { return this.stopProcess('dev', projectId); }
  url(projectId) { return this.devUrls.get(projectId) || null; }
  isRunning(source, projectId) { return this.processes.has(`${source}:${projectId}`); }

  probeUrl(projectId, url) {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, response => {
      response.resume();
      this.emit({ type: 'health', source: 'preview', projectId, url, ok: response.statusCode < 500, statusCode: response.statusCode });
    });
    request.setTimeout(3000, () => request.destroy(new Error('Preview health check timed out')));
    request.on('error', error => this.emit({ type: 'health', source: 'preview', projectId, url, ok: false, text: error.message, error }));
  }

  dispose() {
    Array.from(this.processes.keys()).forEach(key => {
      const [source, projectId] = key.split(':');
      this.stopProcess(source, projectId);
    });
    Array.from(this.terminals.values()).forEach(record => this.stopInteractiveClaude(record.projectId, record.id));
    this.processes.clear();
  }
}

ProcessManager.detectPackageManager = detectPackageManager;
ProcessManager.detectProjectProfile = detectProjectProfile;
ProcessManager.parseLocalUrl = parseLocalUrl;
ProcessManager.textFromClaudeEvent = textFromClaudeEvent;
module.exports = ProcessManager;
