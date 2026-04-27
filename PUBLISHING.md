# Publishing Checklist

Use this checklist before pushing a public GitHub repository or creating a
release artifact.

## Source Boundary

- Keep `src/`, `resources/bin/`, `node_modules/`, `out/`, and `dist/` out of git.
- Do not publish this package to npm; `package.json` is marked `private` because
  the Electron `main` entry points at generated app assets.
- Treat upstream app extracts and downloaded binaries as generated artifacts.
- Keep this project clearly described as unofficial and community-maintained.
- Preserve attribution in `NOTICE.md` and the README credits.

## Local Verification

```bash
npm run validate:release
node scripts/patch-all.js --check
```

## Linux Smoke Check

```bash
npm run install:linux
codex-desktop-rebuild --status
```

The desktop launcher should use an IPC socket under
`$XDG_RUNTIME_DIR/codex-desktop-rebuild` so it can coexist with the VSCode Codex
extension.

## Release Notes

- State that the app is unofficial and not affiliated with OpenAI.
- Explain the Linux IPC isolation and proxy handling changes.
- Mention any patch warnings that are non-blocking but still visible in logs.
