#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HOME = os.homedir();
const DEFAULT_BIN_DIR = path.join(HOME, ".local", "bin");
const DEFAULT_DESKTOP_DIR = path.join(HOME, ".local", "share", "applications");
const LAUNCHER_TEMPLATE = path.join(ROOT, "resources", "linux", "codex-desktop-rebuild");
const DESKTOP_TEMPLATE = path.join(ROOT, "resources", "linux", "codex-desktop-rebuild.desktop.in");
const ICON_PATH = path.join(ROOT, "resources", "electron.png");
const APP_DIR = process.env.CODEX_DESKTOP_REBUILD_APP_DIR || ROOT;

function parseArgs(argv) {
  const options = {
    binDir: process.env.CODEX_DESKTOP_REBUILD_BIN_DIR || DEFAULT_BIN_DIR,
    desktopDir: process.env.CODEX_DESKTOP_REBUILD_DESKTOP_DIR || DEFAULT_DESKTOP_DIR,
    dryRun: false,
    uninstall: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--uninstall") {
      options.uninstall = true;
    } else if (arg === "--bin-dir") {
      options.binDir = path.resolve(argv[++index]);
    } else if (arg === "--desktop-dir") {
      options.desktopDir = path.resolve(argv[++index]);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/install-linux.js [options]

Options:
  --dry-run              Print planned writes without changing files
  --uninstall            Remove installed launcher and desktop entry
  --bin-dir <dir>        Override launcher install directory
  --desktop-dir <dir>    Override desktop entry install directory
  -h, --help             Show this help
`);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function renderTemplate(filePath, replacements) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value);
  }
  return content;
}

function writeFile(filePath, content, mode, options) {
  if (options.dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode });
  fs.chmodSync(filePath, mode);
  console.log(`[ok] wrote ${filePath}`);
}

function removeFile(filePath, options) {
  if (options.dryRun) {
    console.log(`[dry-run] remove ${filePath}`);
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
    console.log(`[ok] removed ${filePath}`);
  } else {
    console.log(`[skip] missing ${filePath}`);
  }
}

function install(options) {
  ensureFile(LAUNCHER_TEMPLATE, "Launcher template");
  ensureFile(DESKTOP_TEMPLATE, "Desktop template");
  ensureFile(ICON_PATH, "Icon");

  const binPath = path.join(options.binDir, "codex-desktop-rebuild");
  const desktopPath = path.join(options.desktopDir, "codex-desktop-rebuild.desktop");

  const replacements = {
    __APP_DIR__: APP_DIR,
    __BIN_PATH__: binPath,
    __ICON_PATH__: ICON_PATH,
  };

  writeFile(binPath, renderTemplate(LAUNCHER_TEMPLATE, replacements), 0o755, options);
  writeFile(desktopPath, renderTemplate(DESKTOP_TEMPLATE, replacements), 0o644, options);

  console.log("\nInstalled Codex Desktop Rebuild launcher.");
  console.log(`  Run:      ${binPath}`);
  console.log(`  Status:   ${binPath} --status`);
  console.log(`  Desktop:  ${desktopPath}`);
}

function uninstall(options) {
  removeFile(path.join(options.binDir, "codex-desktop-rebuild"), options);
  removeFile(path.join(options.desktopDir, "codex-desktop-rebuild.desktop"), options);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (process.platform !== "linux") {
      throw new Error(`Linux installer cannot run on ${process.platform}`);
    }

    if (options.uninstall) {
      uninstall(options);
    } else {
      install(options);
    }
  } catch (error) {
    console.error(`[x] ${error.message}`);
    process.exit(1);
  }
}

main();
