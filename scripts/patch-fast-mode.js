#!/usr/bin/env node
/**
 * Post-build patch: Force-enable Fast mode (speed selector)
 *
 * The speed selector (Fast / Standard) is gated behind two conditions:
 *   1. Statsig feature flag: statsig_default_enable_features.fast_mode === true
 *   2. Auth method check: authMethod === "chatgpt"
 *
 * The visibility hook returns:
 *   n?.fast_mode === !0 && Dt(t)
 * where Dt(e) { return e === `chatgpt` }
 *
 * This patch locates the hook via AST (function containing
 * "statsig_default_enable_features") and replaces the gating
 * LogicalExpression with !0, making the speed selector always visible.
 *
 * Target file: general-settings-*.js chunk
 *
 * Usage:
 *   node scripts/patch-fast-mode.js [platform]   # Apply (unix/win/omit=both)
 *   node scripts/patch-fast-mode.js --check       # Dry-run
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { locateBundles, relPath } = require("./patch-util");

// ──────────────────────────────────────────────
//  AST walker
// ──────────────────────────────────────────────

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) walk(item, visitor);
      }
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor);
    }
  }
}

// ──────────────────────────────────────────────
//  Patch logic
// ──────────────────────────────────────────────

const FEATURE_STORE_KEY = "statsig_default_enable_features";
const FAST_MODE_KEY = "fast_mode";

function collectPatches(ast, source) {
  const patches = [];

  walk(ast, (node) => {
    // Match function containing "statsig_default_enable_features"
    if (
      node.type !== "FunctionDeclaration" &&
      node.type !== "FunctionExpression" &&
      node.type !== "ArrowFunctionExpression"
    )
      return;

    const funcSrc = source.slice(node.start, node.end);
    if (!funcSrc.includes(FEATURE_STORE_KEY)) return;
    if (!funcSrc.includes(FAST_MODE_KEY)) return;

    // Inside this function, find the LogicalExpression:
    //   X?.fast_mode === !0 && Dt(Y)
    // Pattern: LogicalExpression { operator: "&&",
    //   left: BinaryExpression { operator: "===", right: UnaryExpression(!0) }
    //   right: CallExpression { callee: Identifier, arguments: [Identifier] }
    // }
    walk(node, (child) => {
      if (child.type !== "LogicalExpression" || child.operator !== "&&") return;

      const left = child.left;
      const right = child.right;

      // left must be: X === !0
      if (
        !left ||
        left.type !== "BinaryExpression" ||
        left.operator !== "==="
      )
        return;

      // left.right must be !0 (UnaryExpression: !0)
      const lr = left.right;
      if (
        !lr ||
        lr.type !== "UnaryExpression" ||
        lr.operator !== "!" ||
        lr.argument?.value !== 0
      )
        return;

      // left.left should reference fast_mode (MemberExpression with .fast_mode)
      const ll = left.left;
      if (!ll) return;
      const llSrc = source.slice(ll.start, ll.end);
      if (!llSrc.includes(FAST_MODE_KEY)) return;

      // right must be a call: Dt(identifier)
      if (!right || right.type !== "CallExpression") return;
      if (right.arguments.length !== 1) return;

      const exprSrc = source.slice(child.start, child.end);
      if (exprSrc === "!0") return; // already patched

      patches.push({
        id: "fast_mode_gate",
        start: child.start,
        end: child.end,
        replacement: "!0",
        original: exprSrc,
      });

      // Also find the auth check function (Dt) and patch it
      // Dt is the callee of the right side
      const authFuncName = right.callee?.name;
      if (authFuncName) {
        findAndPatchAuthFunc(ast, source, authFuncName, patches);
      }
    });
  });

  return patches;
}

/**
 * Find function authFuncName(e) { return e === `chatgpt` }
 * and replace the return expression with !0
 */
function findAndPatchAuthFunc(ast, source, funcName, patches) {
  walk(ast, (node) => {
    // Match: function funcName(e) { return e === `chatgpt` }
    if (node.type !== "FunctionDeclaration") return;
    if (!node.id || node.id.name !== funcName) return;

    const body = node.body;
    if (!body || body.type !== "BlockStatement") return;
    if (body.body.length !== 1) return;

    const ret = body.body[0];
    if (ret.type !== "ReturnStatement" || !ret.argument) return;

    const arg = ret.argument;
    if (arg.type !== "BinaryExpression" || arg.operator !== "===") return;

    const retSrc = source.slice(arg.start, arg.end);
    if (retSrc === "!0") return; // already patched
    if (!retSrc.includes("chatgpt")) return;

    // Don't add duplicate
    if (patches.some((p) => p.start === arg.start)) return;

    patches.push({
      id: "auth_method_check",
      start: arg.start,
      end: arg.end,
      replacement: "!0",
      original: retSrc,
    });
  });
}

// ──────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => a === "unix" || a === "win");

  // Scan JS chunks for fast_mode gate logic (chunk name varies across versions)
  const { SRC_DIR } = require("./patch-util");
  const platforms = platform
    ? [platform]
    : ["unix", "win"].filter((p) =>
        fs.existsSync(path.join(SRC_DIR, p, "webview", "assets"))
      );

  const targets = [];
  for (const plat of platforms) {
    const assetsDir = path.join(SRC_DIR, plat, "webview", "assets");
    if (!fs.existsSync(assetsDir)) continue;
    for (const f of fs.readdirSync(assetsDir)) {
      if (!f.endsWith(".js")) continue;
      if (f.startsWith("index-")) continue; // index has refs but not the gate function
      const fp = path.join(assetsDir, f);
      const src = fs.readFileSync(fp, "utf-8");
      if (src.includes(FEATURE_STORE_KEY) && src.includes(FAST_MODE_KEY)) {
        targets.push({ platform: plat, path: fp });
      }
    }
  }

  if (targets.length === 0) {
    console.error("[x] No chunk contains fast_mode gate logic");
    process.exit(1);
  }

  for (const bundle of targets) {
    console.log(`\n-- [${bundle.platform}] ${relPath(bundle.path)}`);
    const source = fs.readFileSync(bundle.path, "utf-8");
    console.log(`   size: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

    const t0 = Date.now();
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    console.log(`   parse: ${Date.now() - t0}ms`);

    const patches = collectPatches(ast, source);

    if (patches.length === 0) {
      if (source.includes(FEATURE_STORE_KEY)) {
        // Check if already patched
        const idx = source.indexOf(FEATURE_STORE_KEY);
        const nearby = source.slice(idx, idx + 300);
        if (!nearby.includes("===!0&&")) {
          console.log("   [ok] Fast mode already force-enabled");
        } else {
          console.log("   [!] fast_mode gate found but AST pattern did not match");
        }
      } else {
        console.log("   [!] statsig_default_enable_features not found");
      }
      continue;
    }

    if (isCheck) {
      console.log(`   [?] Matches: ${patches.length}`);
      for (const p of patches) {
        console.log(`     > [${p.id}] offset ${p.start}: ${p.original} -> ${p.replacement}`);
      }
      continue;
    }

    patches.sort((a, b) => b.start - a.start);

    let code = source;
    for (const p of patches) {
      console.log(`   * [${p.id}] offset ${p.start}: ${p.original} -> ${p.replacement}`);
      code = code.slice(0, p.start) + p.replacement + code.slice(p.end);
    }

    fs.writeFileSync(bundle.path, code, "utf-8");
    console.log(`   [ok] Fast mode force-enabled: ${patches.length} replacements`);
  }
}

main();
