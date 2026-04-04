const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  dotenv.config({
    path: filePath,
    override: false,
  });
}

function loadSdkEnv() {
  if (loaded) {
    return;
  }

  const sdkRoot = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(sdkRoot, '..', '..');

  // Prefer SDK-local config while still allowing shell vars to win.
  loadFile(path.join(sdkRoot, '.env'));
  loadFile(path.join(repoRoot, '.env'));

  loaded = true;
}

function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}

module.exports = {
  isDemoMode,
  loadSdkEnv,
};
