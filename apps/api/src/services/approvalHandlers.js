const { approvalStore } = require('./approvalStore');
const { auditLogger } = require('./auditLogger');
const { executeDelegatedAction, summarizeParams } = require('./actionExecutor');

async function approvePendingAction(req, res) {
  const { auditId } = req.params;
  const pending = approvalStore.get(auditId);

  if (!pending) {
    return res.status(404).json({ error: 'Pending action not found or already resolved' });
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
  const pending = approvalStore.resolve(auditId, { status: 'rejected' });

  if (!pending) {
    return res.status(404).json({ error: 'Pending action not found or already resolved' });
  }

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
