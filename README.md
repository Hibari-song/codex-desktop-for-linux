# Codex Desktop Rebuild for Linux

Unofficial Linux desktop rebuild for Codex, focused on giving Linux users a desktop experience similar to the official macOS and Windows apps.

> This is not an official OpenAI release. It is a community Linux packaging workflow for experimentation and compatibility testing.

## Scope

| Platform | Architecture | Status |
|----------|--------------|--------|
| Linux    | x64, arm64   | Target |

macOS and Windows are intentionally out of scope for this repository because they already have official desktop app paths. This project only tries to close the Linux gap.

## Build

```bash
# Install dependencies
npm install

# Build for current platform
npm run build

# Build for specific platform
npm run build:linux-x64
npm run build:linux-arm64

# Build both Linux architectures
npm run build:linux
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
│   ├── electron.png     # Linux app icon
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

GitHub Actions includes:

- `Validate` on push or pull request to `main`.
- `Build Linux (Manual)` for manually packaging Linux artifacts.
- `Sync Upstream & Patch Linux` for scheduled or manual Linux rebuild checks.

## Credits

Respect and thanks to the original authors and maintainers:

- [OpenAI Codex](https://github.com/openai/codex) — original Codex CLI and desktop experience.
- [Cometix Space / Haleclipse](https://github.com/Haleclipse) — rebuild work and early packaging path.
- [Electron Forge](https://www.electronforge.io/) — build and packaging toolchain.

See `NOTICE.md` for attribution and trademark notes.

## License

Original Codex CLI by OpenAI is licensed under Apache-2.0. This repository's own launcher, installer, build glue, and documentation are released under Apache-2.0; generated upstream app assets are intentionally treated as generated artifacts.

See `LICENSE` for the full Apache-2.0 text, `LICENSE.md` for the asset boundary, and `PUBLISHING.md` for the public release checklist.
