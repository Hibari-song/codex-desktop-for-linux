#!/usr/bin/env node
/**
 * Post-build patch: Force-enable Connections settings section
 *
 * The "Connections" (remote SSH connections) settings page is gated behind
 * Statsig gate 4114442250 and an additional condition. The visibility check:
 *
 *   case `connections`: return i === `electron` && s && !a
 *
 * This patch removes the gate variable (s) and extra condition (!a),
 * keeping only the platform check (i === `electron`).
 *
 * Target: index-*.js — settings section visibility switch
 *
 * Usage:
 *   node scripts/patch-connections.js [platform]   # Apply (unix/win/omit=both)
 *   node scripts/patch-connections.js --check       # Dry-run
 */
const fs = require("fs");
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
//  Patch logic (AST-based)
// ──────────────────────────────────────────────

// Match pattern in SwitchStatement:
//   case `connections`: return <expr containing `electron`> && <gate> && <cond>
// Replace the return argument with just the `electron` platform check

function collectPatches(ast, source) {
  const patches = [];

  walk(ast, (node) => {
    if (node.type !== "SwitchStatement") return;

    for (const c of node.cases) {
      if (!c.test) continue;

      // AST match: case test is Literal/TemplateLiteral with value "connections"
      const testValue = getCaseTestValue(c.test);
      if (testValue !== "connections") continue;

      // Find ReturnStatement in consequent
      for (const stmt of c.consequent) {
        if (stmt.type !== "ReturnStatement" || !stmt.argument) continue;

        const arg = stmt.argument;

        // Must be LogicalExpression with && chains (gated condition)
        if (arg.type !== "LogicalExpression" || arg.operator !== "&&") continue;

        // Walk the && chain to find the BinaryExpression: X === `electron`
        const electronNode = findElectronCheck(arg);
        if (!electronNode) continue;

        const argSrc = source.slice(arg.start, arg.end);
        const replacement = source.slice(electronNode.start, electronNode.end);

        // Already patched (no extra conditions)
        if (argSrc === replacement) continue;

        patches.push({
          start: arg.start,
          end: arg.end,
          replacement,
          original: argSrc,
        });
      }
    }
  });

  return patches;
}

/** Extract string value from SwitchCase test node */
function getCaseTestValue(node) {
  if (node.type === "Literal") return node.value;
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/**
 * Walk a LogicalExpression && chain and find the BinaryExpression
 * that checks X === `electron` (Literal or TemplateLiteral)
 */
function findElectronCheck(node) {
  if (!node) return null;
  if (node.type === "BinaryExpression" && node.operator === "===") {
    if (isElectronLiteral(node.left) || isElectronLiteral(node.right)) {
      return node;
    }
  }
  if (node.type === "LogicalExpression") {
    return findElectronCheck(node.left) || findElectronCheck(node.right);
  }
  return null;
}

function isElectronLiteral(node) {
  if (node.type === "Literal" && node.value === "electron") return true;
  if (
    node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1 &&
    node.quasis[0].value.cooked === "electron"
  ) {
    return true;
  }
  return false;
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
      if (source.includes("connections")) {
        console.log("   [ok] Connections already ungated or pattern changed");
      } else {
        console.log("   [!] No connections case found");
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
    console.log(`   [ok] Connections setting ungated: ${patches.length} replacements`);
  }
}

main();
