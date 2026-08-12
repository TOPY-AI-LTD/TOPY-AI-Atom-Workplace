# Claude Workspace for Atom

Atom package for managing local projects, Claude Code sessions, and frontend development servers from one workspace.

## Current MVP

- Select or register a local project directory.
- Automatically import directories already open in Atom and keep the list synchronized.
- Toggle the Claude Workspace from an Atom Status Bar button and use it in the right sidebar.
- Open the directory in Atom.
- Start a Claude Code inspection session.
- Start and stop `npm run dev`, `pnpm dev`, or `yarn dev`.
- Show process output inside an Atom panel.
- Open a local preview in an embedded panel.
- Save Claude session IDs per project and resume them from the session selector.
- Rename, clear, and automatically resume the most recent saved session.
- Start an interactive Claude session on Linux through the system `script` PTY utility.
- Start multiple interactive Claude terminals with `node-pty` and render them with `xterm.js` when optional dependencies are available.
- Detect common frontend frameworks and package managers from `package.json`.
- Override project settings with a local `.claude-workspace.json` file.
- Show Git branch and dirty working-tree state in the project selector.
- Remove registered projects without deleting their files.

## Requirements

- Atom `1.60+`.
- Claude Code installed and authenticated as `claude` on `PATH`.
- Node.js and the project's package manager.

## Development installation

```bash
git clone https://github.com/TOPY-AI-LTD/TOPY-AI-Atom-Workplace.git ~/.atom/dev/packages/claude-workspace
cd ~/.atom/dev/packages/claude-workspace
atom --dev
```

In the development Atom window, run `Window: Reload` after changing package files.

Run the core tests with:

```bash
npm test
```

## Commands

- `Claude Workspace: Toggle`
- `Claude Workspace: Select Project`
- `Claude Workspace: New Project`
- `Claude Workspace: Start Claude Session`
- `Claude Workspace: Interactive Claude`
- `Claude Workspace: Resume Claude Session`
- `Claude Workspace: Rename Claude Session`
- `Claude Workspace: Start Dev Server`
- `Claude Workspace: Stop Dev Server`
- `Claude Workspace: Open Preview`
- `Claude Workspace: Refresh Preview`
- `Claude Workspace: Open in External Browser`
- `Claude Workspace: Remove Current Project`

Default shortcuts:

- `Ctrl+Alt+C`: toggle workspace
- `Ctrl+Alt+D`: start dev server
- `Ctrl+Alt+P`: open preview

The interactive Claude action currently uses Linux `script` to provide a PTY. On systems without that utility, use the structured `Start Claude` action.
The package falls back to the `script` PTY or a plain child process when optional native/UI terminal dependencies cannot be loaded.

Optional project configuration example:

```json
{
  "devCommand": "pnpm dev -- --port 4100",
  "devPort": 4100,
  "packageManager": "pnpm",
  "framework": "vite"
}
```

## Safety notes

The package launches `claude` and the project's development command as child processes in the selected project directory. It does not pass `--dangerously-skip-permissions` or store Claude credentials.

## Roadmap

- Persist and resume Claude session IDs.
- Complete interactive permission prompts and signal handling.
- Detect framework and dev port from more configuration formats.
- Add project removal and process status indicators.
- Add tests for the process manager and project store.
