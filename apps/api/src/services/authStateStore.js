const crypto = require('crypto');
const { readJson, writeJson } = require('./persistence');

const FILE_NAME = 'auth-states.json';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

class AuthStateStore {
  constructor() {
    const stored = readJson(FILE_NAME, {});
    this.states = stored && typeof stored === 'object' ? stored : {};
    this._pruneExpired(true);
  }

  _save() {
    writeJson(FILE_NAME, this.states);
  }

  _pruneExpired(saveAfterPrune = false) {
    const now = Date.now();
    let changed = false;

    for (const [state, record] of Object.entries(this.states)) {
      const expiresAt = new Date(record?.expiresAt || 0).getTime();
      if (!expiresAt || expiresAt <= now) {
        delete this.states[state];
        changed = true;
      }
    }

    if (changed || saveAfterPrune) {
      this._save();
    }
  }

  create(service, ttlMs = DEFAULT_TTL_MS, metadata = {}) {
    this._pruneExpired();

    const state = `st_${crypto.randomBytes(16).toString('hex')}`;
    const now = Date.now();
    const record = {
      service,
      ...metadata,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
    };

    this.states[state] = record;
    this._save();

    return {
      state,
      ...record,
    };
  }

  consume(state) {
    if (!state) {
      return null;
    }

    this._pruneExpired();

    const record = this.states[state];
    if (!record) {
      return null;
    }

    delete this.states[state];
    this._save();
    return record;
  }
}

const authStateStore = new AuthStateStore();

module.exports = { authStateStore };
