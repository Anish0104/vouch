const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { readJson, writeJson } = require('./persistence');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const FILE_NAME = 'audit-events.json';
const DEMO_MODE = isDemoMode();
const DEMO_DELEGATION_ID = 'del_demo';

class AuditLogger extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
    this.maxEvents = 500;
    this.clients = new Set(); // SSE response objects
    const storedEvents = readJson(FILE_NAME, []);
    this.events = (Array.isArray(storedEvents) ? storedEvents : []).filter((event) =>
      DEMO_MODE ? true : event?.delegationId !== DEMO_DELEGATION_ID,
    );

    if (!this.events.length && DEMO_MODE) {
      this._seedDemoEvents();
      this._save();
    } else if (this.events.length !== (Array.isArray(storedEvents) ? storedEvents.length : 0)) {
      this._save();
    }
  }

  _save() {
    writeJson(FILE_NAME, this.events);
  }

  _seedDemoEvents() {
    const now = Date.now();
    const seed = [
      { agent: 'cursor-agent', action: 'github.readCode', params: 'src/payment.js', status: 'allowed', ts: now - 120000 },
      { agent: 'cursor-agent', action: 'github.createBranch', params: 'feature/fix-null-check', status: 'allowed', ts: now - 90000 },
      { agent: 'devin-agent', action: 'linear.createIssue', params: 'Bug: null check missing', status: 'pending_approval', ts: now - 60000 },
      { agent: 'devin-agent', action: 'linear.createIssue', params: 'Bug: null check missing', status: 'approved', ts: now - 55000 },
      { agent: 'cursor-agent', action: 'github.mergeToMain', params: '—', status: 'blocked', ts: now - 40000 },
      { agent: 'cursor-agent', action: 'github.accessSecrets', params: '—', status: 'blocked', ts: now - 30000 },
      { agent: 'cursor-agent', action: 'github.openPR', params: '#42 "Fix null check payment"', status: 'pending_approval', ts: now - 15000 },
      { agent: 'cursor-agent', action: 'github.openPR', params: '#42 "Fix null check payment"', status: 'approved', ts: now - 10000 },
    ];

    this.events = seed.map((e) => ({
      id: `aud_${uuidv4().slice(0, 8)}`,
      agent: e.agent,
      action: e.action,
      params: e.params,
      status: e.status,
      timestamp: new Date(e.ts).toISOString(),
      delegationId: 'del_demo',
      parentAuditId: null,
      service: e.action.split('.')[0],
    }));
  }

  log({ agent, action, params, status, delegationId, reason, result, auditId, parentAuditId }) {
    const event = {
      id: auditId || `aud_${uuidv4().slice(0, 8)}`,
      agent: agent || 'unknown-agent',
      action,
      params: params || '—',
      status,
      reason: reason || null,
      result: result || null,
      delegationId: delegationId || null,
      parentAuditId: parentAuditId || null,
      service: action ? action.split('.')[0] : 'unknown',
      timestamp: new Date().toISOString(),
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
    this._save();

    // Broadcast to all SSE clients
    this._broadcast(event);
    this.emit('action', event);
    return event;
  }

  _broadcast(event) {
    const data = `event: action\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  addClient(res) {
    this.clients.add(res);
    // Send last 50 events to new client
    const recent = this.events.slice(0, 50).reverse();
    for (const event of recent) {
      try {
        res.write(`event: action\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        break;
      }
    }
  }

  removeClient(res) {
    this.clients.delete(res);
  }

  closeAllClients() {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // Ignore client close errors during shutdown.
      }
    }

    this.clients.clear();
  }

  getEvents({ limit = 100, status, agent, auditId, parentAuditId, delegationId } = {}) {
    let results = this.events;
    if (status) results = results.filter((e) => e.status === status);
    if (agent) results = results.filter((e) => e.agent === agent);
    if (auditId) {
      results = results.filter((e) => e.id === auditId || e.parentAuditId === auditId);
    }
    if (parentAuditId) {
      results = results.filter((e) => e.parentAuditId === parentAuditId);
    }
    if (delegationId) {
      results = results.filter((e) => e.delegationId === delegationId);
    }
    return results.slice(0, limit);
  }

  getActiveSessions() {
    const sessionMap = {};
    for (const event of this.events) {
      const key = event.agent;
      if (!sessionMap[key]) {
        sessionMap[key] = {
          agent: event.agent,
          delegationId: event.delegationId,
          lastAction: event.action,
          lastSeen: event.timestamp,
          totalActions: 0,
          blockedActions: 0,
          pendingApprovals: 0,
        };
      }
      sessionMap[key].totalActions++;
      if (event.status === 'blocked') sessionMap[key].blockedActions++;
      if (event.status === 'pending_approval') sessionMap[key].pendingApprovals++;
    }
    return Object.values(sessionMap);
  }
}

// Singleton
const auditLogger = new AuditLogger();
module.exports = { auditLogger };
