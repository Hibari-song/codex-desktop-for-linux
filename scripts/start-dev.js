#!/usr/bin/env node
/**
 * Smart development startup script
 * Automatically detects system architecture and sets correct CLI path
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  getBinaryName,
  getPlatformArch,
  syncVendorToLocal,
} = require('./codex-binary');

// Detect platform and architecture
const platform = process.platform;
const arch = os.arch();
const projectRoot = path.join(__dirname, '..');
const binDir = getPlatformArch(platform, arch);
if (!binDir) {
  console.error(`Unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

const cliName = getBinaryName(platform);
const localCliPath = path.join(projectRoot, 'resources', 'bin', binDir, cliName);

// 从 npm vendor 同步到 resources/bin/
if (syncVendorToLocal(projectRoot, platform, arch)) {
  console.log(`[start-dev] Synced codex binary: vendor → resources/bin/${binDir}/${cliName}`);
}

const cliPath = localCliPath;

// Verify CLI exists
if (!fs.existsSync(cliPath)) {
  console.error(`CLI not found at: ${cliPath}`);
  console.error('Tried: resources/bin/, node_modules/@openai/codex-*/vendor/, and node_modules/@cometix/codex/vendor/');
  process.exit(1);
}

console.log(`[start-dev] Platform: ${platform}, Arch: ${arch}`);
console.log(`[start-dev] CLI Path: ${cliPath}`);

const childEnv = {
  ...process.env,
  CODEX_CLI_PATH: cliPath,
  BUILD_FLAVOR: process.env.BUILD_FLAVOR || 'dev',
  // 使用 app:// 自定义协议加载静态资源（而非 Vite dev server）
  ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL || 'app://-/index.html',
};
delete childEnv.ELECTRON_RUN_AS_NODE;

// Launch Electron with CLI path
const electronBin = require('electron');
const child = spawn(electronBin, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: childEnv,
});

child.on('close', (code) => {
  process.exit(code);
});
