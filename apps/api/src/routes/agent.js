const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getFrontendUrl } = require('../config/runtime');
const { verifyM2M } = require('../middleware/verifyM2M');
const { checkPolicy } = require('../middleware/checkPolicy');
const { delegationStore } = require('../services/delegationStore');
const { auditLogger } = require('../services/auditLogger');
const { approvalStore } = require('../services/approvalStore');
const { executeDelegatedAction, summarizeParams } = require('../services/actionExecutor');

router.post('/action', verifyM2M, async (req, res) => {
  const { service, action, params = {} } = req.body || {};
  const delegationId = req.headers['x-vouch-delegation'] || 'del_demo';
  const auditId = `aud_${uuidv4().slice(0, 8)}`;

  if (!service || !action) {
    return res.status(400).json({
      status: 'error',
      error: 'service and action are required',
      auditId,
    });
  }

  const delegation = delegationStore.get(delegationId);
  if (!delegation) {
    return res.status(404).json({
      status: 'error',
      error: 'Delegation not found or expired',
      auditId,
    });
  }

  const fullAction = `${service}.${action}`;
  const agentId = delegation.agentId || req.auth?.agentId || req.auth?.sub || 'unknown-agent';
  const paramsSummary = summarizeParams(params);

  if (delegation.services?.length && !delegation.services.includes(service)) {
    const reason = `Service ${service} is not enabled for this delegation`;

    auditLogger.log({
      auditId,
      agent: agentId,
      action: fullAction,
      params: paramsSummary,
      status: 'blocked',
      reason,
      delegationId,
    });

    return res.status(403).json({
      status: 'blocked',
      reason,
      auditId,
    });
  }

  const policyResult = checkPolicy(fullAction, delegation.policy);

  if (!policyResult.allowed) {
    auditLogger.log({
      auditId,
      agent: agentId,
      action: fullAction,
      params: paramsSummary,
      status: 'blocked',
      reason: policyResult.reason,
      delegationId,
    });

    return res.status(403).json({
      status: 'blocked',
      reason: policyResult.reason,
      auditId,
    });
  }

  if (policyResult.requiresStepUp) {
    const approvalUrl = `${getFrontendUrl()}/approve/${auditId}`;

    auditLogger.log({
      auditId,
      agent: agentId,
      action: fullAction,
      params: paramsSummary,
      status: 'pending_approval',
      delegationId,
    });

    approvalStore.create({
      service,
      action,
      params,
      delegation,
      agentId,
      delegationId,
      auditId,
      createdAt: new Date().toISOString(),
    });

    return res.status(202).json({
      status: 'pending_approval',
      approvalUrl,
      auditId,
      message: 'Step-up approval required. Waiting for human confirmation.',
    });
  }

  try {
    const result = await executeDelegatedAction({
      userId: delegation.userId,
      service,
      action,
      params,
    });

    auditLogger.log({
      auditId,
      agent: agentId,
      action: fullAction,
      params: paramsSummary,
      status: 'allowed',
      result: JSON.stringify(result).slice(0, 200),
      delegationId,
    });

    return res.json({ status: 'success', result, auditId });
  } catch (err) {
    console.error(`[Agent] Action failed: ${fullAction}`, err.message);

    auditLogger.log({
      auditId,
      agent: agentId,
      action: fullAction,
      params: paramsSummary,
      status: 'error',
      reason: err.message,
      delegationId,
    });

    return res.status(500).json({ status: 'error', error: err.message, auditId });
  }
});

router.get('/pending', (req, res) => {
  const pending = approvalStore.list();
  res.json({ pending });
});

module.exports = { router };
