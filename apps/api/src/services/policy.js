const DEFAULT_EXPIRY = '48h';

function uniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function parseDuration(value = DEFAULT_EXPIRY) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return 48 * 60 * 60 * 1000;
  }

  const match = value.trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) {
    return 48 * 60 * 60 * 1000;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;

  return 48 * 60 * 60 * 1000;
}

function normalizePolicy(rawPolicy = {}) {
  const stepUpSource = rawPolicy.stepUpRequired ?? rawPolicy.step_up_required;

  return {
    agent: typeof rawPolicy.agent === 'string' && rawPolicy.agent.trim()
      ? rawPolicy.agent.trim()
      : 'cursor',
    allow: uniqueStrings(rawPolicy.allow),
    deny: uniqueStrings(rawPolicy.deny),
    stepUpRequired: uniqueStrings(stepUpSource),
    expiresIn: typeof rawPolicy.expiresIn === 'string' && rawPolicy.expiresIn.trim()
      ? rawPolicy.expiresIn.trim()
      : typeof rawPolicy.expires === 'string' && rawPolicy.expires.trim()
        ? rawPolicy.expires.trim()
        : DEFAULT_EXPIRY,
  };
}

function extractServicesFromPolicy(policy = {}) {
  const actions = [
    ...uniqueStrings(policy.allow),
    ...uniqueStrings(policy.deny),
    ...uniqueStrings(policy.stepUpRequired),
  ];

  return [...new Set(
    actions
      .map((action) => action.split('.')[0])
      .filter(Boolean),
  )];
}

module.exports = {
  extractServicesFromPolicy,
  normalizePolicy,
  parseDuration,
};
