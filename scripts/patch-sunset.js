/**
 * Post-build patch: Disable appSunset forced-update gate
 *
 * Codex uses Statsig gate "2929582856" to control version sunsetting.
 * When the gate returns true, a full-screen "Update Required" overlay blocks the UI.
 *
 * This script uses AST matching to replace the Cs("2929582856") gate check
 * with !1 (false), so the sunset guard always passes through to normal children.
 *
 * Match pattern:
 *   Functions containing literal "2929582856" -> find Cs(identifier) calls -> replace with !1
 *
 * Usage:
 *   node scripts/patch-sunset.js [platform]   # Apply patch (unix/win/omit=both)
 *   node scripts/patch-sunset.js --check      # Dry-run: report matches
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { locateBundles, relPath } = require("./patch-util");

// ──────────────────────────────────────────────
//  AST walker
// ──────────────────────────────────────────────

function walk(node, visitor, parent) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node, parent);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walk(item, visitor, node);
        }
      }
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor, node);
    }
  }
}

// ──────────────────────────────────────────────
//  Patch rule
// ──────────────────────────────────────────────

const SUNSET_GATE_ID = "2929582856";

function collectPatches(ast, source) {
  const allPatches = [];

  walk(ast, (node) => {
    // Find functions whose body contains the sunset gate ID
    if (
      node.type !== "FunctionDeclaration" &&
      node.type !== "FunctionExpression" &&
      node.type !== "ArrowFunctionExpression"
    )
      return;

    const funcSrc = source.slice(node.start, node.end);
    if (!funcSrc.includes(SUNSET_GATE_ID)) return;

    // Within this function, find Cs(xxx) calls
    walk(node, (child) => {
      if (child.type !== "CallExpression") return;
      const callee = child.callee;
      if (!callee || callee.type !== "Identifier") return;
      // Cs is the minified useGateValue — verify by name pattern
      if (child.arguments.length !== 1) return;

      const callSrc = source.slice(child.start, child.end);
      if (callSrc === "!1") return; // already patched

      // Verify callee name matches Cs pattern (2-char identifier used as gate checker)
      if (callee.name.length > 3) return;

      if (!allPatches.some((x) => x.start === child.start)) {
        allPatches.push({
          start: child.start,
          end: child.end,
          replacement: "!1",
          original: callSrc,
        });
      }
    });
  });

  return allPatches;
}

// ──────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => a === "unix" || a === "win");

  const bundles = locateBundles({
    dir: "assets",
    pattern: /^index-.*\.js$/,
    platform,
  });

  if (bundles.length === 0) {
    console.error("[x] No index bundle found");
    process.exit(1);
  }

  for (const bundle of bundles) {
    console.log(`\n-- [${bundle.platform}] ${relPath(bundle.path)}`);
    const source = fs.readFileSync(bundle.path, "utf-8");
    console.log(`   size: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

    const t0 = Date.now();
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    console.log(`   parse: ${Date.now() - t0}ms`);

    const patches = collectPatches(ast, source);

    if (patches.length === 0) {
      if (!source.includes(SUNSET_GATE_ID)) {
        console.log("   [!] Sunset gate ID not found in bundle");
      } else {
        console.log("   [ok] Sunset gate already disabled");
      }
      continue;
    }

    if (isCheck) {
      console.log(`   [?] Matches: ${patches.length}`);
      for (const p of patches) {
        console.log(`     > offset ${p.start}: ${p.original} -> ${p.replacement}`);
      }
      continue;
    }

    patches.sort((a, b) => b.start - a.start);

    let code = source;
    for (const p of patches) {
      console.log(`   * offset ${p.start}: ${p.original} -> ${p.replacement}`);
      code = code.slice(0, p.start) + p.replacement + code.slice(p.end);
    }

    fs.writeFileSync(bundle.path, code, "utf-8");
    console.log(`   [ok] Sunset gate disabled: ${patches.length} gate calls -> !1`);
  }
}

main();
