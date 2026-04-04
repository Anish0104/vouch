const { callGitHub } = require('./github');
const { callLinear } = require('./linear');

const executors = {
  github: callGitHub,
  linear: callLinear,
};

function formatValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (value && typeof value === 'object') {
    if (typeof value.path === 'string') return value.path;
    if (typeof value.title === 'string') return value.title;
    return JSON.stringify(value);
  }

  return 'null';
}

function summarizeParams(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return '—';
  }

  const summary = Object.entries(params)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(', ');

  return summary ? summary.slice(0, 180) : '—';
}

async function executeDelegatedAction({ userId, service, action, params = {} }) {
  const executor = executors[service];
  if (!executor) {
    throw new Error(`Unknown service: ${service}`);
  }

  return executor(userId, action, params);
}

module.exports = {
  executeDelegatedAction,
  summarizeParams,
};
