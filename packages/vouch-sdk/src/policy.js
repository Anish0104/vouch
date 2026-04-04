const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');

async function resolvePolicyPath(startDir = process.cwd()) {
  let currentDir = path.resolve(startDir);

  while (true) {
    const filePath = path.join(currentDir, '.vouch.yml');

    try {
      await fs.access(filePath);
      return filePath;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(`No .vouch.yml file found in ${path.resolve(startDir)} or its parent directories`);
}

function normalizePolicy(raw = {}) {
  return {
    agent: raw.agent || 'cursor',
    expires: raw.expires || '48h',
    allow: Array.isArray(raw.allow) ? raw.allow : [],
    deny: Array.isArray(raw.deny) ? raw.deny : [],
    stepUpRequired: Array.isArray(raw.step_up_required)
      ? raw.step_up_required
      : Array.isArray(raw.stepUpRequired)
        ? raw.stepUpRequired
        : [],
  };
}

async function loadPolicy(cwd = process.cwd()) {
  const filePath = await resolvePolicyPath(cwd);
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    return normalizePolicy(yaml.load(contents));
  } catch (error) {
    throw error;
  }
}

function getPolicyDecision(policy, action) {
  if (policy.deny.includes(action)) {
    return { allowed: false, reason: `Action ${action} is explicitly denied by policy` };
  }

  if (!policy.allow.includes(action)) {
    return { allowed: false, reason: `Action ${action} is not in the allowed list` };
  }

  return {
    allowed: true,
    requiresStepUp: policy.stepUpRequired.includes(action),
  };
}

module.exports = {
  getPolicyDecision,
  loadPolicy,
  normalizePolicy,
  resolvePolicyPath,
};
