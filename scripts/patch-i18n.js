/**
 * Post-build patch: Force-enable i18n multi-language support
 *
 * Codex i18n is gated behind Statsig cloud config 72216192, field "enable_i18n".
 * Default value is false, which causes:
 *   - Language selector not rendered
 *   - Locale messages not loaded
 *   - Language switching has no effect
 *
 * This patch replaces all `r?.get("enable_i18n", !1)` with `r?.get("enable_i18n", !0)`,
 * forcing i18n to be enabled by default, independent of Statsig cloud control.
 *
 * Match strategy (exact string match + context validation):
 *   - Search: .get(`enable_i18n`,!1)
 *   - Replace: .get(`enable_i18n`,!0)
 *   - Validate: Statsig config ID 72216192 must exist within +/-500 chars
 *
 * Usage:
 *   node scripts/patch-i18n.js [platform]     # Apply patch (unix/win/omit=both)
 *   node scripts/patch-i18n.js --check        # Dry-run: report matches without modifying
 */
const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────────────
//  Bundle location (multi-platform support)
// ──────────────────────────────────────────────

const SRC_DIR = path.join(__dirname, "..", "src");

function locateBundles(platform) {
  const platforms = platform
    ? [platform]
    : ["unix", "win"].filter((p) =>
        fs.existsSync(path.join(SRC_DIR, p, "webview", "assets"))
      );

  // Fallback: legacy flat structure src/webview/assets/
  if (platforms.length === 0) {
    const fallback = path.join(SRC_DIR, "webview", "assets");
    if (fs.existsSync(fallback)) {
      const files = fs
        .readdirSync(fallback)
        .filter((f) => /^index-.*\.js$/.test(f));
      if (files.length === 1)
        return [{ platform: "legacy", path: path.join(fallback, files[0]) }];
    }
    console.error("[x] No index-*.js bundle found");
    process.exit(1);
  }

  const results = [];
  for (const plat of platforms) {
    const assetsDir = path.join(SRC_DIR, plat, "webview", "assets");
    if (!fs.existsSync(assetsDir)) continue;

    const files = fs
      .readdirSync(assetsDir)
      .filter((f) => /^index-.*\.js$/.test(f));

    if (files.length === 0) {
      console.warn(`  [!] ${plat}: no index-*.js found`);
      continue;
    }
    if (files.length > 1) {
      console.warn(
        `  [!] ${plat}: multiple index-*.js found: ${files.join(", ")}`
      );
      continue;
    }

    results.push({ platform: plat, path: path.join(assetsDir, files[0]) });
  }

  return results;
}

// ──────────────────────────────────────────────
//  Patch logic
// ──────────────────────────────────────────────

// Exact match targets (backtick, single-quote, double-quote variants)
const SEARCH_PATTERNS = [
  { find: ".get(`enable_i18n`,!1)", replace: ".get(`enable_i18n`,!0)" },
  { find: ".get('enable_i18n',!1)", replace: ".get('enable_i18n',!0)" },
  { find: '.get("enable_i18n",!1)', replace: '.get("enable_i18n",!0)' },
];

// Context validation: Statsig config ID 72216192 must appear nearby
const CONTEXT_MARKER = "72216192";
const CONTEXT_RANGE = 500;

function patchSource(source, filePath, isCheck) {
  let code = source;
  let totalPatches = 0;

  for (const pattern of SEARCH_PATTERNS) {
    let idx = code.indexOf(pattern.find);
    while (idx !== -1) {
      // Context validation
      const contextStart = Math.max(0, idx - CONTEXT_RANGE);
      const contextEnd = Math.min(code.length, idx + CONTEXT_RANGE);
      const context = code.slice(contextStart, contextEnd);

      if (context.includes(CONTEXT_MARKER)) {
        totalPatches++;
        if (isCheck) {
          console.log(`  > offset ${idx}`);
          console.log(
            `    context: ...${code.slice(Math.max(0, idx - 40), idx + pattern.find.length + 20)}...`
          );
        } else {
          code =
            code.slice(0, idx) +
            pattern.replace +
            code.slice(idx + pattern.find.length);
          console.log(
            `  * offset ${idx}: enable_i18n default !1 -> !0`
          );
        }
      }

      idx = code.indexOf(pattern.find, idx + 1);
    }
  }

  return { code, patchCount: totalPatches };
}

// ──────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => a === "unix" || a === "win");

  const bundles = locateBundles(platform);
  if (bundles.length === 0) {
    console.error("[x] No patchable bundles found");
    process.exit(1);
  }

  let grandTotal = 0;

  for (const bundle of bundles) {
    const relPath = path.relative(path.join(__dirname, ".."), bundle.path);
    console.log(`\n-- [${bundle.platform}] ${relPath}`);

    const source = fs.readFileSync(bundle.path, "utf-8");
    console.log(
      `   size: ${(source.length / 1024 / 1024).toFixed(1)} MB`
    );

    // Idempotency check
    const alreadyPatched = SEARCH_PATTERNS.every(
      (p) => !source.includes(p.find)
    );
    if (alreadyPatched) {
      const hasEnabled = SEARCH_PATTERNS.some((p) =>
        source.includes(p.replace)
      );
      if (hasEnabled) {
        console.log(
          "   [ok] Already enabled (previously patched or upstream changed)"
        );
      } else {
        console.log(
          "   [!] enable_i18n pattern not found (code structure may have changed)"
        );
      }
      continue;
    }

    const { code, patchCount } = patchSource(source, bundle.path, isCheck);
    grandTotal += patchCount;

    if (isCheck) {
      console.log(`   [?] Matches: ${patchCount}`);
      continue;
    }

    if (patchCount > 0) {
      fs.writeFileSync(bundle.path, code, "utf-8");
      console.log(`   [ok] i18n force-enabled: ${patchCount} replacements`);
    } else {
      console.log("   [!] No matches");
    }
  }

  if (isCheck) {
    console.log(`\n=> Total: ${grandTotal} patchable locations`);
  }
}

main();
