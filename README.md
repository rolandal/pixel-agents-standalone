# Pixel Agents Standalone

A standalone web app that visualizes your Claude Code sessions as pixel art characters working in a virtual office.

Each Claude Code agent becomes a character that walks around, sits at a desk, and visually reflects what it's doing — writing code, running tools, waiting for permission, or idle.

![Screenshot](webview-ui/public/Screenshot.jpg)

> **Based on [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca** (MIT License).
> The original is a VS Code extension. This fork runs as a standalone web app in your browser — no VS Code required.

## What's Different

| Original (VS Code Extension) | This Fork (Standalone Web App) |
|-------------------------------|-------------------------------|
| Runs inside VS Code webview | Runs in any browser at `localhost:3456` |
| Uses VS Code extension API | Express + WebSocket server |
| Requires VS Code | Works with any terminal |

## Quick Start

```bash
npm install
cd webview-ui && npm install && cd ..
npm run build
npm start
```

Open `http://localhost:3456` in your browser. The server watches `~/.claude/projects/` for active Claude Code sessions and shows agents in real time.

## Auto-Launch with Claude Code

To start the server automatically when a Claude Code session begins, add a `SessionStart` hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "/path/to/pixel-agents/scripts/cmux-hook.sh"
      }
    ]
  }
}
```

Edit `scripts/cmux-hook.sh` and set `PIXEL_AGENTS_DIR` to wherever you cloned this repo.

## Development

```bash
npm run dev
```

Runs the Express server (with hot reload) and Vite dev server concurrently.

## Architecture

- **Server** (`server/`) — Express + WebSocket. Watches JSONL transcripts, parses agent activity, serves the UI.
- **Watcher** — Monitors `~/.claude/projects/` for active session files using chokidar.
- **Parser** — Reads JSONL lines to detect tool usage, subagent spawns, permission requests, idle states.
- **UI** (`webview-ui/`) — React + Canvas 2D game engine with pathfinding, sprite animation, and an office layout editor.

## Office Tileset

The built-in layout uses basic furniture (desks, chairs, plants). For the full 452-piece furniture catalog, purchase the [Office Interior Tileset](https://donarg.itch.io/officetileset) by Donarg ($2 on itch.io), place it at `assets/office_tileset_16x16.png`, and run:

```bash
npm run extract-furniture
```

## Credits

- **[pixel-agents](https://github.com/pablodelucca/pixel-agents)** by Pablo De Lucca — original VS Code extension (MIT License)
- **[Office Interior Tileset](https://donarg.itch.io/officetileset)** by Donarg — pixel art furniture (purchased separately)

## License

MIT
