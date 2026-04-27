#!/usr/bin/env node
/**
 * Pre-build step: Copy platform-specific ASAR content into flat src/ structure.
 *
 * forge.config.js expects:
 *   src/.vite/build/   (main process bundles)
 *   src/webview/       (renderer assets)
 *   src/skills/        (skills directory)
 *
 * This script copies from src/{unix|win}/ into that flat layout.
 *
 * Usage:
 *   node scripts/prepare-src.js --platform unix    # For macOS/Linux builds
 *   node scripts/prepare-src.js --platform win     # For Windows builds
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

function clearDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function main() {
  const args = process.argv.slice(2);
  const platIdx = args.indexOf("--platform");
  const platform = platIdx !== -1 ? args[platIdx + 1] : null;

  if (!platform || !["unix", "win"].includes(platform)) {
    console.error("[x] Usage: prepare-src.js --platform <unix|win>");
    process.exit(1);
  }

  const platDir = path.join(SRC, platform);
  if (!fs.existsSync(platDir)) {
    console.error(`[x] Platform directory not found: src/${platform}/`);
    process.exit(1);
  }

  console.log(`-- Preparing src/ from src/${platform}/`);

  // .vite/build/
  const buildSrc = path.join(platDir, ".vite", "build");
  const buildDest = path.join(SRC, ".vite", "build");
  clearDir(buildDest);
  const buildCount = copyRecursive(buildSrc, buildDest);
  console.log(`   .vite/build/ : ${buildCount} files`);

  // webview/
  const webviewSrc = path.join(platDir, "webview");
  const webviewDest = path.join(SRC, "webview");
  clearDir(webviewDest);
  const webviewCount = copyRecursive(webviewSrc, webviewDest);
  console.log(`   webview/     : ${webviewCount} files`);

  // skills/
  const skillsSrc = path.join(platDir, "skills");
  const skillsDest = path.join(SRC, "skills");
  if (fs.existsSync(skillsSrc)) {
    clearDir(skillsDest);
    const skillsCount = copyRecursive(skillsSrc, skillsDest);
    console.log(`   skills/      : ${skillsCount} files`);
  }

  // package.json: copy upstream's to src/ AND sync version+metadata to root
  const upstreamPkgPath = path.join(platDir, "package.json");
  if (fs.existsSync(upstreamPkgPath)) {
    fs.copyFileSync(upstreamPkgPath, path.join(SRC, "package.json"));

    const upstream = JSON.parse(fs.readFileSync(upstreamPkgPath, "utf-8"));
    const rootPkgPath = path.join(__dirname, "..", "package.json");
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));

    const oldVer = rootPkg.version;
    rootPkg.version = upstream.version || rootPkg.version;
    rootPkg.codexBuildNumber = upstream.codexBuildNumber || rootPkg.codexBuildNumber;

    // Sync main entry to match upstream structure
    rootPkg.main = "src/.vite/build/bootstrap.js";

    // Carry over upstream metadata keys needed by the app at runtime
    for (const key of [
      "codexBuildFlavor",
      "codexSparkleFeedUrl",
      "codexSparklePublicKey",
      "codexWindowsUpdateUrl",
      "codexWindowsPackageIdentity",
      "codexWindowsPackagePublisher",
    ]) {
      if (upstream[key]) rootPkg[key] = upstream[key];
    }

    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n");
    console.log(`   package.json : synced (${oldVer} -> ${rootPkg.version})`);
  }

  // Verify entry point exists
  const entry = path.join(buildDest, "bootstrap.js");
  if (!fs.existsSync(entry)) {
    console.warn("[!] bootstrap.js not found in .vite/build/ -- forge may fail");
  }

  console.log(`   [ok] src/ ready for ${platform} build`);
}

main();
