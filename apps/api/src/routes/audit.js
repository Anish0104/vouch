const express = require('express');
const router = express.Router();
const { auditLogger } = require('../services/auditLogger');
const { auditSnapshotStore } = require('../services/auditSnapshotStore');
const { approvalStore } = require('../services/approvalStore');
const { delegationStore } = require('../services/delegationStore');
const { approvePendingAction, rejectPendingAction } = require('../services/approvalHandlers');
const { getFrontendUrl, isDemoMode, loadApiEnv } = require('../config/runtime');
const { verifyUserAccessToken } = require('../middleware/verifyUserAccessToken');

loadApiEnv();

const DEMO_MODE = isDemoMode();

function belongsToUser(delegationId, userId) {
  if (DEMO_MODE) {
    return true;
  }

  if (!delegationId || !userId) {
    return false;
  }

  const delegation = delegationStore.get(delegationId);
  return delegation?.userId === userId;
}

function parseLimit(limit, fallback = 100) {
  const parsedLimit = Number.parseInt(limit, 10);
  return Number.isFinite(parsedLimit) ? parsedLimit : fallback;
}

function getFilteredEvents(req) {
  const {
    limit = 100,
    status,
    agent,
    auditId,
    parentAuditId,
    delegationId,
  } = req.query;

  return auditLogger.getEvents({
    limit: parseLimit(limit, 100),
    status,
    agent,
    auditId,
    parentAuditId,
    delegationId,
  }).filter((event) => belongsToUser(event.delegationId, req.auth?.sub));
}

function summarizeEvents(events) {
  const counts = events.reduce((accumulator, event) => {
    accumulator[event.status] = (accumulator[event.status] || 0) + 1;
    return accumulator;
  }, {});

  return {
    total: events.length,
    allowed: counts.allowed || 0,
    blocked: counts.blocked || 0,
    pendingApproval: counts.pending_approval || 0,
    approved: counts.approved || 0,
    rejected: counts.rejected || 0,
    errors: counts.error || 0,
    services: [...new Set(events.map((event) => event.service).filter(Boolean))],
    agents: [...new Set(events.map((event) => event.agent).filter(Boolean))],
    latestTimestamp: events[0]?.timestamp || null,
  };
}

function escapeCsv(value) {
  const raw = value == null ? '' : String(value);
  if (!/[",\n]/.test(raw)) {
    return raw;
  }
  return `"${raw.replace(/"/g, '""')}"`;
}

function formatCsv(events) {
  const rows = [
    ['id', 'timestamp', 'agent', 'service', 'action', 'status', 'params', 'reason', 'delegationId'],
    ...events.map((event) => ([
      event.id,
      event.timestamp,
      event.agent,
      event.service,
      event.action,
      event.status,
      event.params,
      event.reason || '',
      event.delegationId || '',
    ])),
  ];

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
}

router.get('/stream', verifyUserAccessToken, (req, res) => {
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

  auditLogger.addClient(res, (event) => belongsToUser(event.delegationId, req.auth?.sub));

  req.on('close', () => {
    clearInterval(heartbeat);
    auditLogger.removeClient(res);
  });
});

router.get('/', verifyUserAccessToken, (req, res) => {
  const events = getFilteredEvents(req);

  res.json({ events, total: events.length });
});

router.get('/export', verifyUserAccessToken, (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const events = getFilteredEvents(req);
  const fileBase = `vouch-audit-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.csv"`);
    res.send(formatCsv(events));
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    filters: {
      status: req.query.status || null,
      agent: req.query.agent || null,
      delegationId: req.query.delegationId || null,
      limit: parseLimit(req.query.limit, 100),
    },
    summary: summarizeEvents(events),
    events,
  });
});

router.post('/share', verifyUserAccessToken, express.json(), (req, res) => {
  const filters = req.body && typeof req.body === 'object' ? req.body : {};
  const events = auditLogger.getEvents({
    limit: parseLimit(filters.limit, 100),
    status: filters.status,
    agent: filters.agent,
    delegationId: filters.delegationId,
    auditId: filters.auditId,
    parentAuditId: filters.parentAuditId,
  }).filter((event) => belongsToUser(event.delegationId, req.auth?.sub));

  const snapshot = auditSnapshotStore.create({
    title: filters.title,
    userId: req.auth?.sub || null,
    filters,
    summary: summarizeEvents(events),
    events,
  });

  res.status(201).json({
    snapshotId: snapshot.snapshotId,
    shareUrl: `${getFrontendUrl()}/audit/share/${snapshot.snapshotId}`,
    snapshot,
  });
});

router.get('/share/:snapshotId', (req, res) => {
  const snapshot = auditSnapshotStore.get(req.params.snapshotId);

  if (!snapshot) {
    return res.status(404).json({ error: 'Audit snapshot not found' });
  }

  return res.json(snapshot);
});

router.get('/sessions', verifyUserAccessToken, (req, res) => {
  const pendingByAgent = approvalStore
    .list()
    .filter((pending) => belongsToUser(pending.delegationId, req.auth?.sub))
    .reduce((accumulator, pending) => {
      accumulator[pending.agentId] = (accumulator[pending.agentId] || 0) + 1;
      return accumulator;
    }, {});

  const sessions = auditLogger
    .getActiveSessions()
    .filter((session) => belongsToUser(session.delegationId, req.auth?.sub))
    .map((session) => ({
      ...session,
      pendingApprovals: pendingByAgent[session.agent] || 0,
    }));

  res.json({ sessions });
});

router.get('/pending', verifyUserAccessToken, (req, res) => {
  const pending = approvalStore
    .list()
    .filter((record) => belongsToUser(record.delegationId, req.auth?.sub));

  res.json({ pending });
});

router.post('/approve/:auditId', verifyUserAccessToken, approvePendingAction);
router.post('/reject/:auditId', verifyUserAccessToken, rejectPendingAction);

module.exports = router;
