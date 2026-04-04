const express = require('express');
const router = express.Router();
const { getFrontendUrl } = require('../config/runtime');
const { connectionStore } = require('../services/connectionStore');
const { delegationStore } = require('../services/delegationStore');
const { normalizePolicy } = require('../services/policy');

router.post('/', (req, res) => {
  const { agentId, policy, services, userId } = req.body;

  if (!agentId || !policy) {
    return res.status(400).json({ error: 'agentId and policy are required' });
  }

  const normalizedPolicy = normalizePolicy(policy);

  if (!normalizedPolicy.allow.length) {
    return res.status(400).json({ error: 'policy.allow must be an array' });
  }

  const connectedUserId = ['github', 'linear']
    .map((service) => connectionStore.getUserId(service))
    .find(Boolean);

  const resolvedUserId = userId || req.auth?.sub || connectedUserId || 'demo-user';

  const delegation = delegationStore.create({
    agentId,
    userId: resolvedUserId,
    policy: normalizedPolicy,
    services,
  });

  return res.status(201).json({
    delegationId: delegation.delegationId,
    inviteToken: delegation.inviteToken,
    expiresAt: delegation.expiresAt,
    inviteUrl: `${getFrontendUrl()}/invite/${delegation.inviteToken}`,
  });
});

router.get('/', (req, res) => {
  const delegations = delegationStore.list().map((d) => ({
    delegationId: d.delegationId,
    agentId: d.agentId,
    services: d.services,
    expiresAt: d.expiresAt,
    createdAt: d.createdAt,
    allow: d.policy.allow,
    deny: d.policy.deny,
    stepUpRequired: d.policy.stepUpRequired,
  }));
  res.json({ delegations });
});

router.get('/invite/:token', (req, res) => {
  const delegation = delegationStore.getByInviteToken(req.params.token);

  if (!delegation) {
    return res.status(404).json({ error: 'Invite token not found or expired' });
  }

  return res.json({
    delegationId: delegation.delegationId,
    agentId: delegation.agentId,
    services: delegation.services,
    expiresAt: delegation.expiresAt,
    policy: delegation.policy,
  });
});

router.get('/:id', (req, res) => {
  const delegation = delegationStore.get(req.params.id);
  if (!delegation) {
    return res.status(404).json({ error: 'Delegation not found or expired' });
  }
  res.json({
    delegationId: delegation.delegationId,
    agentId: delegation.agentId,
    services: delegation.services,
    expiresAt: delegation.expiresAt,
    createdAt: delegation.createdAt,
    policy: delegation.policy,
  });
});

module.exports = router;
