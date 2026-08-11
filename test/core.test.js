const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const ProjectStore = require('../lib/project-store');
const ProcessManager = require('../lib/process-manager');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claude-workspace-'));
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writes: [], write(value) { this.writes.push(value); } };
  child.killed = false;
  child.kill = signal => { child.killed = signal || true; child.emit('close', 0); };
  return child;
}

function testProjectStore() {
  const root = makeTempDir();
  const projectPath = path.join(root, 'demo');
  fs.mkdirSync(projectPath);
  const store = new ProjectStore(path.join(root, 'config'));
  const project = store.upsert(ProjectStore.defaultProject(projectPath));

  assert.strictEqual(store.active().path, projectPath);
  assert.strictEqual(store.all().length, 1);
  store.addSession(project.id, { id: 'session-1', title: 'Initial inspection' });

  const reloaded = new ProjectStore(path.join(root, 'config'));
  assert.strictEqual(reloaded.active().claudeSessions[0].id, 'session-1');
  assert.strictEqual(reloaded.active().claudeSessions[0].title, 'Initial inspection');
  assert.strictEqual(reloaded.remove(project.id), true);
  assert.strictEqual(reloaded.all().length, 0);
  fs.rmSync(root, { recursive: true, force: true });
}

function testProcessManager() {
  const projectRoot = makeTempDir();
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev' } }));
  const events = [];
  const children = [];
  const manager = new ProcessManager(event => events.push(event), {
    spawn: (bin, args, options) => {
      const child = fakeChild();
      children.push({ bin, args, options, child });
      return child;
    }
  });

  manager.startDevServer('demo', projectRoot);
  assert.strictEqual(children[0].bin, 'npm');
  assert.deepStrictEqual(children[0].args, ['run', 'dev']);
  assert.strictEqual(children[0].options.cwd, projectRoot);
  children[0].child.stdout.emit('data', 'ready - started server on http://localhost:3001\n');
  assert.strictEqual(manager.url('demo'), 'http://localhost:3001');

  manager.runClaude('demo', projectRoot, 'Inspect the project');
  const claude = children[1].child;
  claude.stdout.emit('data', '{"type":"system","session_id":"session-42"}\n');
  claude.stdout.emit('data', '{"type":"result","result":"All good"}\n');
  assert(events.some(event => event.type === 'session' && event.sessionId === 'session-42'));
  assert(events.some(event => event.type === 'output' && event.text === 'All good'));
  assert.strictEqual(manager.stopClaude('demo'), true);
  assert.strictEqual(claude.killed, 'SIGTERM');
  manager.runInteractiveClaude('demo', projectRoot);
  const terminal = children[2];
  assert.strictEqual(terminal.bin, 'script');
  assert.strictEqual(manager.sendInteractiveInput('demo', 'hello'), true);
  assert.deepStrictEqual(terminal.child.stdin.writes, ['hello\n']);
  const secondTerminalId = manager.runInteractiveClaude('demo', projectRoot);
  const thirdTerminalId = manager.runInteractiveClaude('demo', projectRoot);
  assert.strictEqual(manager.terminalIds('demo').length, 3);
  assert.strictEqual(manager.sendInteractiveInput('demo', 'second', secondTerminalId), true);
  assert.deepStrictEqual(children[3].child.stdin.writes, ['second\n']);
  manager.stopInteractiveClaude('demo', secondTerminalId);
  assert.strictEqual(manager.terminalIds('demo').length, 2);
  assert.strictEqual(manager.interruptInteractiveClaude('demo', thirdTerminalId), true);
  assert(events.some(event => event.type === 'interrupt' && event.terminalId === thirdTerminalId));
  assert(manager.profile(projectRoot).framework === 'node' || manager.profile(projectRoot).framework === 'nextjs');
  manager.stopClaude('demo');
  manager.dispose();
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

function testHelpers() {
  assert.strictEqual(ProcessManager.parseLocalUrl('Local: http://127.0.0.1:4321'), 'http://127.0.0.1:4321');
  assert.strictEqual(ProcessManager.parseLocalUrl('ready on localhost:3000'), 'http://localhost:3000');
  assert.strictEqual(ProcessManager.parseLocalUrl('no address here'), null);
  assert.strictEqual(ProcessManager.textFromClaudeEvent({ result: 'done' }), 'done');
}

function testProjectProfiles() {
  const root = makeTempDir();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { vite: '^5.0.0', react: '^18.0.0' }, scripts: { dev: 'vite --port 4180' } }));
  const profile = ProcessManager.detectProjectProfile(root, fs);
  assert.deepStrictEqual(profile, { framework: 'vite', packageManager: 'npm', devCommand: null, devPort: 4180 });
  fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default { server: { port: 4190 } };');
  fs.writeFileSync(path.join(root, '.claude-workspace.json'), JSON.stringify({ devPort: 4200, devCommand: 'npm run start' }));
  const configured = ProcessManager.detectProjectProfile(root, fs);
  assert.strictEqual(configured.devPort, 4200);
  assert.strictEqual(configured.devCommand, 'npm run start');
  fs.rmSync(root, { recursive: true, force: true });
}

testProjectStore();
testProcessManager();
testHelpers();
testProjectProfiles();
console.log('All core tests passed.');
