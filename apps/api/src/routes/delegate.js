const express = require('express');
const router = express.Router();
const { getFrontendUrl, isDemoMode, loadApiEnv } = require('../config/runtime');
const { delegationStore } = require('../services/delegationStore');
const { createDemoScenarioDelegation } = require('../services/demoScenario');
const { normalizePolicy } = require('../services/policy');
const { summarizePolicy } = require('../services/policySummary');
const { verifyUserAccessToken } = require('../middleware/verifyUserAccessToken');

loadApiEnv();

const DEMO_MODE = isDemoMode();

function serializeDelegation(delegation) {
  if (!delegation) {
    return null;
  }

  return {
    delegationId: delegation.delegationId,
    agentId: delegation.agentId,
    services: delegation.services,
    inviteToken: delegation.inviteToken,
    expiresAt: delegation.expiresAt,
    createdAt: delegation.createdAt,
    policy: delegation.policy,
    allow: delegation.policy?.allow || [],
    deny: delegation.policy?.deny || [],
    stepUpRequired: delegation.policy?.stepUpRequired || [],
    summary: summarizePolicy(delegation.policy),
  };
}

router.post('/', verifyUserAccessToken, (req, res) => {
  const { agentId, policy, services, userId } = req.body;

  if (!agentId || !policy) {
    return res.status(400).json({ error: 'agentId and policy are required' });
  }

  const normalizedPolicy = normalizePolicy(policy);

  if (!normalizedPolicy.allow.length) {
    return res.status(400).json({ error: 'policy.allow must be an array' });
  }

  const resolvedUserId = DEMO_MODE ? (userId || req.auth?.sub || 'demo-user') : req.auth?.sub;

  const delegation = delegationStore.create({
    agentId,
    userId: resolvedUserId,
    policy: normalizedPolicy,
    services,
  });

  return res.status(201).json({
    ...serializeDelegation(delegation),
    inviteUrl: `${getFrontendUrl()}/invite/${delegation.inviteToken}`,
  });
});

router.post('/demo-scenario', verifyUserAccessToken, (req, res) => {
  const resolvedUserId = DEMO_MODE ? (req.auth?.sub || 'demo-user') : req.auth?.sub;
  const { delegation, scenario } = createDemoScenarioDelegation(resolvedUserId);

  return res.status(201).json({
    ...serializeDelegation(delegation),
    inviteUrl: `${getFrontendUrl()}/invite/${delegation.inviteToken}`,
    scenario,
  });
});

router.get('/', verifyUserAccessToken, (req, res) => {
  const delegations = delegationStore
    .list()
    .filter((delegation) => (DEMO_MODE ? true : delegation.userId === req.auth?.sub))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map((delegation) => serializeDelegation(delegation));

  res.json({ delegations });
});

router.get('/invite/:token', (req, res) => {
  const delegation = delegationStore.getByInviteToken(req.params.token);

  if (!delegation) {
    return res.status(404).json({ error: 'Invite token not found or expired' });
  }

  return res.json({
    ...serializeDelegation(delegation),
  });
});

router.get('/:id', verifyUserAccessToken, (req, res) => {
  const delegation = delegationStore.get(req.params.id);
  if (!delegation || (!DEMO_MODE && delegation.userId !== req.auth?.sub)) {
    return res.status(404).json({ error: 'Delegation not found or expired' });
  }
  res.json(serializeDelegation(delegation));
});

module.exports = router;
