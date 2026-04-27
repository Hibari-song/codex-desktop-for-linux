# Codex Desktop Rebuild

Unofficial cross-platform Electron rebuild for Codex Desktop, with a Linux-first launcher that can coexist with the VSCode Codex extension.

> This is not an official OpenAI release. It is a community rebuild/packaging workflow for experimentation and compatibility testing.

## Supported Platforms

| Platform | Architecture | Status |
|----------|--------------|--------|
| macOS    | x64, arm64   | ✅     |
| Windows  | x64          | ✅     |
| Linux    | x64, arm64   | ✅     |

## Build

```bash
# Install dependencies
npm install

# Build for current platform
npm run build

# Build for specific platform
npm run build:mac-x64
npm run build:mac-arm64
npm run build:win-x64
npm run build:linux-x64
npm run build:linux-arm64

# Build all platforms
npm run build:all
```

## Linux Quick Install

```bash
npm install
npm run install:linux
codex-desktop-rebuild
```

The Linux installer writes:

- `~/.local/bin/codex-desktop-rebuild`
- `~/.local/share/applications/codex-desktop-rebuild.desktop`

Useful commands:

```bash
codex-desktop-rebuild --status
npm run uninstall:linux
node scripts/install-linux.js --dry-run
```

## Linux Stability Additions

This fork carries a small Linux launcher layer instead of patching generated app bundles:

- Isolates the desktop IPC socket under `$XDG_RUNTIME_DIR/codex-desktop-rebuild`, so it does not fight VSCode's Codex extension for `/tmp/codex-ipc`.
- Reuses an existing proxy environment or reads VSCode's proxy setting only when that proxy is actually listening.
- Adds `NO_PROXY` for local loopback endpoints.
- Cleans up stale desktop processes and stale IPC sockets before launching a fresh instance.
- Writes launcher logs to `~/.cache/codex-desktop-rebuild/launcher.log`.

## Development

```bash
npm run dev
```

## Project Structure

```
├── src/
│   ├── .vite/build/     # Main process (Electron)
│   └── webview/         # Renderer (Frontend)
├── resources/
│   ├── electron.icns    # App icon
│   ├── linux/           # Linux launcher and desktop-entry templates
│   └── notification.wav # Sound
├── scripts/
│   ├── install-linux.js
│   ├── patch-*.js
│   └── sync-upstream.js
├── forge.config.js      # Electron Forge config
└── package.json
```

## CI/CD

GitHub Actions automatically builds on:
- Push to `master`
- Tag `v*` → Creates draft release

## Credits

Respect and thanks to the original authors and maintainers:

- [OpenAI Codex](https://github.com/openai/codex) — original Codex CLI and desktop experience.
- [Cometix Space / Haleclipse](https://github.com/Haleclipse) — cross-platform rebuild work and early packaging path.
- [Electron Forge](https://www.electronforge.io/) — build and packaging toolchain.

See `NOTICE.md` for attribution and trademark notes.

## License

Original Codex CLI by OpenAI is licensed under Apache-2.0. This repository contains rebuild scripts and compatibility glue; generated upstream app assets are intentionally treated as generated artifacts.

See `LICENSE.md` for the repository code license and asset boundary. See `PUBLISHING.md` for the public release checklist.
