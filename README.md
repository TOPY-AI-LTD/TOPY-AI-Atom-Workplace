# Claude Workspace for Atom

Atom package for managing local projects, Claude Code sessions, and frontend development servers from one workspace.

## Current MVP

- Select or register a local project directory.
- Open the directory in Atom.
- Start a Claude Code inspection session.
- Start and stop `npm run dev`, `pnpm dev`, or `yarn dev`.
- Show process output inside an Atom panel.
- Open a local preview in an embedded panel.

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

## Commands

- `Claude Workspace: Toggle`
- `Claude Workspace: Select Project`
- `Claude Workspace: New Project`
- `Claude Workspace: Start Claude Session`
- `Claude Workspace: Start Dev Server`
- `Claude Workspace: Stop Dev Server`
- `Claude Workspace: Open Preview`

Default shortcuts:

- `Ctrl+Alt+C`: toggle workspace
- `Ctrl+Alt+D`: start dev server
- `Ctrl+Alt+P`: open preview

## Safety notes

The package launches `claude` and the project's development command as child processes in the selected project directory. It does not pass `--dangerously-skip-permissions` or store Claude credentials.

## Roadmap

- Persist and resume Claude session IDs.
- Add a real interactive terminal using `node-pty` and `xterm.js`.
- Detect framework and dev port more reliably.
- Add project removal and process status indicators.
- Add tests for the process manager and project store.
