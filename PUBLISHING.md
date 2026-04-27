# Publishing Checklist

Use this checklist before pushing a public GitHub repository or creating a
release artifact.

## Source Boundary

- Keep `src/`, `resources/bin/`, `node_modules/`, `out/`, and `dist/` out of git.
- Do not publish this package to npm; `package.json` is marked `private` because
  the Electron `main` entry points at generated app assets.
- Treat upstream app extracts and downloaded binaries as generated artifacts.
- Keep this project clearly described as unofficial and community-maintained.
- Keep the public positioning Linux-only; do not present this as a macOS or
  Windows replacement.
- Preserve attribution in `NOTICE.md` and the README credits.

## Secret Hygiene

- Do not commit `.env`, local auth files, API keys, access tokens, or personal
  proxy credentials.
- Run a secret scan before pushing, including current files and git history.
- If a real secret ever appears in git history, rotate it immediately; deleting
  the file in a later commit is not enough.

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
- State that macOS and Windows are intentionally out of scope.
- Explain the Linux IPC isolation and proxy handling changes.
- Mention any patch warnings that are non-blocking but still visible in logs.
