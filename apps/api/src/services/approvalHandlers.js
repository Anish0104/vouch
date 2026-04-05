const { approvalStore } = require('./approvalStore');
const { auditLogger } = require('./auditLogger');
const { executeDelegatedAction, summarizeParams } = require('./actionExecutor');
const { isDemoMode, loadApiEnv } = require('../config/runtime');

loadApiEnv();

const DEMO_MODE = isDemoMode();

async function approvePendingAction(req, res) {
  const { auditId } = req.params;
  const pending = approvalStore.get(auditId);

  if (!pending) {
    return res.status(404).json({ error: 'Pending action not found or already resolved' });
  }

  if (!DEMO_MODE && pending.delegation?.userId !== req.auth?.sub) {
    return res.status(403).json({ error: 'You are not allowed to approve this action' });
  }

  try {
    const result = await executeDelegatedAction({
      userId: pending.delegation.userId,
      service: pending.service,
      action: pending.action,
      params: pending.params,
    });

    approvalStore.resolve(auditId, { status: 'approved', result });

    const event = auditLogger.log({
      auditId: `${auditId}_approved`,
      parentAuditId: auditId,
      agent: pending.agentId,
      action: `${pending.service}.${pending.action}`,
      params: summarizeParams(pending.params),
      status: 'approved',
      result: JSON.stringify(result).slice(0, 200),
      delegationId: pending.delegationId,
    });

    return res.json({
      status: 'approved',
      result,
      auditId,
      parentAuditId: auditId,
      event,
    });
  } catch (error) {
    approvalStore.resolve(auditId, { status: 'error', error: error.message });

    auditLogger.log({
      auditId: `${auditId}_error`,
      parentAuditId: auditId,
      agent: pending.agentId,
      action: `${pending.service}.${pending.action}`,
      params: summarizeParams(pending.params),
      status: 'error',
      reason: error.message,
      delegationId: pending.delegationId,
    });

    return res.status(500).json({ error: error.message, auditId });
  }
}

function rejectPendingAction(req, res) {
  const { auditId } = req.params;
  const pendingRecord = approvalStore.get(auditId);

  if (!pendingRecord) {
    return res.status(404).json({ error: 'Pending action not found or already resolved' });
  }

  if (!DEMO_MODE && pendingRecord.delegation?.userId !== req.auth?.sub) {
    return res.status(403).json({ error: 'You are not allowed to reject this action' });
  }

  const pending = approvalStore.resolve(auditId, { status: 'rejected' });

  const event = auditLogger.log({
    auditId: `${auditId}_rejected`,
    parentAuditId: auditId,
    agent: pending.agentId,
    action: `${pending.service}.${pending.action}`,
    params: summarizeParams(pending.params),
    status: 'rejected',
    delegationId: pending.delegationId,
  });

  return res.json({
    status: 'rejected',
    auditId,
    parentAuditId: auditId,
    event,
  });
}

module.exports = {
  approvePendingAction,
  rejectPendingAction,
};
