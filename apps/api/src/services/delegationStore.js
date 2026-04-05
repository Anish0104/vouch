const { v4: uuidv4 } = require('uuid');
const { extractServicesFromPolicy, normalizePolicy, parseDuration } = require('./policy');
const { readJson, writeJson } = require('./persistence');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const FILE_NAME = 'delegations.json';
const DEMO_MODE = isDemoMode();
const DEMO_DELEGATION_ID = 'del_demo';
const DEMO_INVITE_TOKEN = 'vch_demo_token_abc123';

function isDemoDelegation(delegation) {
  return delegation?.delegationId === DEMO_DELEGATION_ID || delegation?.inviteToken === DEMO_INVITE_TOKEN;
}

class DelegationStore {
  constructor() {
    const storedDelegations = readJson(FILE_NAME, []);
    const delegationsToLoad = (Array.isArray(storedDelegations) ? storedDelegations : []).filter((delegation) =>
      DEMO_MODE ? true : !isDemoDelegation(delegation),
    );
    this.delegations = new Map();
    this.inviteTokenIndex = new Map();

    for (const delegation of delegationsToLoad) {
      this._indexDelegation(delegation);
    }

    if (delegationsToLoad.length !== (Array.isArray(storedDelegations) ? storedDelegations.length : 0)) {
      this._save();
    }

    if (DEMO_MODE) {
      this._seedDemo();
    }
  }

  _save() {
    writeJson(FILE_NAME, Array.from(this.delegations.values()));
  }

  _indexDelegation(delegation) {
    if (!delegation?.delegationId || !delegation.inviteToken) return;
    this.delegations.set(delegation.delegationId, delegation);
    this.inviteTokenIndex.set(delegation.inviteToken, delegation.delegationId);
  }

  _seedDemo() {
    if (this.delegations.has(DEMO_DELEGATION_ID)) {
      return;
    }

    const policy = normalizePolicy({
      allow: [
        'github.createBranch',
        'github.readCode',
        'github.openPR',
        'github.listCommits',
        'github.listBranches',
        'github.listPRs',
        'github.getFileContents',
        'github.createCommit',
        'github.pushCode',
        'linear.createIssue',
        'linear.listTeams',
        'linear.listIssues',
        'linear.updateIssue',
      ],
      deny: [
        'github.mergeToMain',
        'github.deleteBranch',
        'github.modifyWorkflows',
        'github.accessSecrets',
        'github.deleteRepo',
      ],
      stepUpRequired: ['github.openPR', 'github.pushCode', 'linear.createIssue'],
      expiresIn: '48h',
    });

    const demo = {
      delegationId: DEMO_DELEGATION_ID,
      agentId: 'cursor-agent',
      userId: 'demo-user',
      policy,
      services: extractServicesFromPolicy(policy),
      inviteToken: DEMO_INVITE_TOKEN,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    this._indexDelegation(demo);
    this._save();
  }

  create({ agentId, userId, policy, services }) {
    const normalizedPolicy = normalizePolicy(policy);
    const delegationId = `del_${uuidv4().slice(0, 8)}`;
    const inviteToken = `vch_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const expiresMs = parseDuration(normalizedPolicy.expiresIn);
    const expiresAt = new Date(Date.now() + expiresMs).toISOString();
    const resolvedServices = Array.isArray(services) && services.length
      ? [...new Set(services)]
      : extractServicesFromPolicy(normalizedPolicy);

    const delegation = {
      delegationId,
      agentId,
      userId,
      policy: normalizedPolicy,
      services: resolvedServices,
      inviteToken,
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    this._indexDelegation(delegation);
    this._save();
    return delegation;
  }

  get(delegationId) {
    const d = this.delegations.get(delegationId);
    if (!d) return null;
    if (new Date(d.expiresAt) < new Date()) {
      this.delete(delegationId);
      return null;
    }
    return d;
  }

  getByInviteToken(token) {
    const id = this.inviteTokenIndex.get(token);
    if (!id) return null;
    return this.get(id);
  }

  list({ includeExpired = false } = {}) {
    return Array.from(this.delegations.values()).filter((delegation) => {
      if (includeExpired) return true;
      return new Date(delegation.expiresAt) >= new Date();
    });
  }

  delete(delegationId) {
    const delegation = this.delegations.get(delegationId);
    if (!delegation) return false;

    this.delegations.delete(delegationId);
    this.inviteTokenIndex.delete(delegation.inviteToken);
    this._save();
    return true;
  }
}

const delegationStore = new DelegationStore();
module.exports = { delegationStore };
