const { normalizePolicy } = require('../services/policy');

/**
 * @param {string} action  - e.g. "github.createBranch"
 * @param {object} policy  - { allow, deny, stepUpRequired, expiresIn }
 * @returns {{ allowed: boolean, requiresStepUp?: boolean, reason?: string }}
 */
function checkPolicy(action, rawPolicy) {
  if (!rawPolicy) {
    return { allowed: false, reason: 'No policy found for this delegation' };
  }

  const policy = normalizePolicy(rawPolicy);

  if (policy.deny?.includes(action)) {
    return {
      allowed: false,
      reason: `Action ${action} is explicitly denied by policy`,
    };
  }

  if (!policy.allow?.includes(action)) {
    return {
      allowed: false,
      reason: `Action ${action} is not in the allowed list`,
    };
  }

  if (policy.stepUpRequired?.includes(action)) {
    return { allowed: true, requiresStepUp: true };
  }

  return { allowed: true };
}

function policyMiddleware(req, res, next) {
  const { action } = req.body;
  const delegation = req.delegation;

  if (!delegation) {
    return res.status(404).json({ error: 'Delegation not found or expired' });
  }

  const result = checkPolicy(action, delegation.policy);
  req.policyResult = result;
  next();
}

module.exports = { checkPolicy, policyMiddleware };
