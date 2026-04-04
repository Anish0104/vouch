const { readJson, writeJson } = require('./persistence');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const FILE_NAME = 'pending-approvals.json';
const DEMO_MODE = isDemoMode();
const DEMO_DELEGATION_ID = 'del_demo';

class ApprovalStore {
  constructor() {
    const stored = readJson(FILE_NAME, []);
    const records = (Array.isArray(stored) ? stored : [])
      .filter((record) => (DEMO_MODE ? true : record?.delegationId !== DEMO_DELEGATION_ID));
    this.pending = new Map(
      records
        .filter((record) => record?.auditId)
        .map((record) => [record.auditId, record]),
    );

    if (records.length !== (Array.isArray(stored) ? stored.length : 0)) {
      this._save();
    }
  }

  _save() {
    writeJson(FILE_NAME, [...this.pending.values()]);
  }

  create(payload) {
    const record = {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
      status: 'pending_approval',
    };

    this.pending.set(record.auditId, record);
    this._save();
    return record;
  }

  get(auditId) {
    return this.pending.get(auditId) || null;
  }

  list(filters = {}) {
    const { agentId, delegationId, service } = filters;

    return [...this.pending.values()]
      .filter((record) => (agentId ? record.agentId === agentId : true))
      .filter((record) => (delegationId ? record.delegationId === delegationId : true))
      .filter((record) => (service ? record.service === service : true))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  resolve(auditId, resolution = {}) {
    const record = this.pending.get(auditId);
    if (!record) return null;

    this.pending.delete(auditId);
    this._save();
    return {
      ...record,
      ...resolution,
      resolvedAt: new Date().toISOString(),
    };
  }
}

const approvalStore = new ApprovalStore();

module.exports = { approvalStore };
