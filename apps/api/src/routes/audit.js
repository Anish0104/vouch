const express = require('express');
const router = express.Router();
const { auditLogger } = require('../services/auditLogger');
const { approvalStore } = require('../services/approvalStore');
const { approvePendingAction, rejectPendingAction } = require('../services/approvalHandlers');

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send heartbeat every 20s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  auditLogger.addClient(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    auditLogger.removeClient(res);
  });
});

router.get('/', (req, res) => {
  const {
    limit = 100,
    status,
    agent,
    auditId,
    parentAuditId,
    delegationId,
  } = req.query;
  const parsedLimit = Number.parseInt(limit, 10);

  const events = auditLogger.getEvents({
    limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
    status,
    agent,
    auditId,
    parentAuditId,
    delegationId,
  });

  res.json({ events, total: events.length });
});

router.get('/sessions', (req, res) => {
  const pendingByAgent = approvalStore.list().reduce((accumulator, pending) => {
    accumulator[pending.agentId] = (accumulator[pending.agentId] || 0) + 1;
    return accumulator;
  }, {});

  const sessions = auditLogger.getActiveSessions().map((session) => ({
    ...session,
    pendingApprovals: pendingByAgent[session.agent] || 0,
  }));

  res.json({ sessions });
});

router.get('/pending', (req, res) => {
  res.json({ pending: approvalStore.list() });
});

router.post('/approve/:auditId', approvePendingAction);
router.post('/reject/:auditId', rejectPendingAction);

module.exports = router;
