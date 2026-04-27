const fs = require("fs");
const path = require("path");

const TARGET_TRIPLE_MAP = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-arm64": "aarch64-unknown-linux-musl",
  "linux-x64": "x86_64-unknown-linux-musl",
  "win32-x64": "x86_64-pc-windows-msvc",
};

function getPlatformArch(platform, arch) {
  const platformArch = `${platform}-${arch}`;
  return TARGET_TRIPLE_MAP[platformArch] ? platformArch : null;
}

function getBinaryName(platform) {
  return platform === "win32" ? "codex.exe" : "codex";
}

function getVendorBinaryPath(rootDir, platform, arch, subdir, binaryName = getBinaryName(platform)) {
  const platformArch = getPlatformArch(platform, arch);
  if (!platformArch) return null;

  const targetTriple = TARGET_TRIPLE_MAP[platformArch];
  const candidates = [
    path.join(rootDir, "node_modules", "@openai", `codex-${platformArch}`, "vendor", targetTriple, subdir, binaryName),
    path.join(rootDir, "node_modules", "@cometix", "codex", "vendor", targetTriple, subdir, binaryName),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function syncVendorToLocal(rootDir, platform, arch) {
  const platformArch = getPlatformArch(platform, arch);
  if (!platformArch) return null;

  const binaryName = getBinaryName(platform);
  const vendorPath = getVendorBinaryPath(rootDir, platform, arch, "codex", binaryName);
  if (!vendorPath) return null;

  const localDir = path.join(rootDir, "resources", "bin", platformArch);
  const localPath = path.join(localDir, binaryName);
  fs.mkdirSync(localDir, { recursive: true });
  fs.copyFileSync(vendorPath, localPath);
  fs.chmodSync(localPath, 0o755);
  return localPath;
}

function getCodexBinaryPath(rootDir, platform, arch) {
  const platformArch = getPlatformArch(platform, arch);
  if (!platformArch) return null;

  const binaryName = getBinaryName(platform);
  syncVendorToLocal(rootDir, platform, arch);

  const localPath = path.join(rootDir, "resources", "bin", platformArch, binaryName);
  if (fs.existsSync(localPath)) return localPath;

  return getVendorBinaryPath(rootDir, platform, arch, "codex", binaryName);
}

function getRgBinaryPath(rootDir, platform, arch) {
  const binaryName = platform === "win32" ? "rg.exe" : "rg";
  return getVendorBinaryPath(rootDir, platform, arch, "path", binaryName);
}

module.exports = {
  getBinaryName,
  getCodexBinaryPath,
  getPlatformArch,
  getRgBinaryPath,
  getVendorBinaryPath,
  syncVendorToLocal,
};
