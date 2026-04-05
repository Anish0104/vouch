const { extractServicesFromPolicy } = require('./policy');

function toList(values) {
  return Array.isArray(values) ? values.filter((value) => typeof value === 'string' && value.trim()) : [];
}

function summarizePolicy(policy = {}) {
  const allow = toList(policy.allow);
  const deny = toList(policy.deny);
  const stepUpRequired = toList(policy.stepUpRequired);
  const services = extractServicesFromPolicy({ allow, deny, stepUpRequired });

  return {
    agent: typeof policy.agent === 'string' && policy.agent.trim() ? policy.agent.trim() : 'cursor',
    expiresIn: typeof policy.expiresIn === 'string' && policy.expiresIn.trim() ? policy.expiresIn.trim() : '48h',
    services,
    allowCount: allow.length,
    denyCount: deny.length,
    stepUpCount: stepUpRequired.length,
    counts: {
      allow: allow.length,
      deny: deny.length,
      stepUp: stepUpRequired.length,
    },
    previews: {
      allow: allow.slice(0, 4),
      deny: deny.slice(0, 4),
      stepUp: stepUpRequired.slice(0, 4),
    },
  };
}

module.exports = {
  summarizePolicy,
};
