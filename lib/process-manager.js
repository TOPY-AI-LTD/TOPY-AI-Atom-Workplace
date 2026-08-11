const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function packageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return { bin: 'pnpm', args: ['dev'] };
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return { bin: 'yarn', args: ['dev'] };
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return { bin: 'npm', args: ['run', 'dev'] };
  return { bin: 'npm', args: ['run', 'dev'] };
}

class ProcessManager {
  constructor(onOutput) {
    this.onOutput = onOutput || (() => {});
    this.claude = null;
    this.devServer = null;
    this.devUrl = null;
  }

  runClaude(projectPath, prompt, sessionId) {
    this.stopClaude();
    const args = ['-p'];
    if (sessionId) args.push('--resume', sessionId);
    args.push('--output-format', 'stream-json', '--verbose', prompt);
    this.claude = spawn('claude', args, { cwd: projectPath, shell: false });
    this.attachOutput(this.claude, 'claude');
    return this.claude;
  }

  startDevServer(projectPath) {
    this.stopDevServer();
    const command = packageManager(projectPath);
    this.devServer = spawn(command.bin, command.args, { cwd: projectPath, shell: false });
    this.devUrl = null;
    this.attachOutput(this.devServer, 'dev');
    return this.devServer;
  }

  attachOutput(child, source) {
    child.stdout.on('data', data => this.handleOutput(source, data.toString()));
    child.stderr.on('data', data => this.handleOutput(source, data.toString()));
    child.on('error', error => this.onOutput({ source, text: error.message, error: true }));
    child.on('close', code => this.onOutput({ source, text: `[process exited with code ${code}]\n` }));
  }

  handleOutput(source, text) {
    if (source === 'dev') {
      const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/);
      if (match) this.devUrl = match[0];
      if (!this.devUrl) {
        const port = text.match(/(?:localhost|127\.0\.0\.1)[: ](\d+)/);
        if (port) this.devUrl = `http://localhost:${port[1]}`;
      }
    }
    this.onOutput({ source, text, url: this.devUrl });
  }

  stopClaude() { if (this.claude) this.claude.kill(); this.claude = null; }
  stopDevServer() { if (this.devServer) this.devServer.kill(); this.devServer = null; this.devUrl = null; }
  dispose() { this.stopClaude(); this.stopDevServer(); }
}

module.exports = ProcessManager;
