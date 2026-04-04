const fs = require('fs');
const path = require('path');
const { getDataDir, loadApiEnv } = require('../config/runtime');

loadApiEnv();

const DATA_DIR = getDataDir();

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

function resolveFile(fileName) {
  return path.join(ensureDataDir(), fileName);
}

function readJson(fileName, fallbackValue) {
  const filePath = resolveFile(fileName);

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallbackValue;
    }

    console.error(`[Persistence] Failed to read ${fileName}:`, error.message);
    return fallbackValue;
  }
}

function writeJson(fileName, value) {
  const filePath = resolveFile(fileName);
  const tempPath = `${filePath}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`[Persistence] Failed to write ${fileName}:`, error.message);
  }
}

module.exports = {
  DATA_DIR,
  readJson,
  writeJson,
};
