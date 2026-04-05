const { readJson, writeJson } = require('./persistence');

const FILE_NAME = 'connections.json';
const DEFAULT_USER_KEY = '__default__';
const DEFAULT_SERVICES = {
  github: {
    connected: false,
    userId: null,
    accountId: null,
    updatedAt: null,
  },
  linear: {
    connected: false,
    userId: null,
    accountId: null,
    updatedAt: null,
  },
};

function cloneDefaultServices(userId = null) {
  return Object.fromEntries(
    Object.entries(DEFAULT_SERVICES).map(([service, defaults]) => [
      service,
      {
        ...defaults,
        userId,
      },
    ]),
  );
}

function normalizeStoredServices(value, userId = null) {
  const next = cloneDefaultServices(userId);

  for (const [service, defaults] of Object.entries(DEFAULT_SERVICES)) {
    const record = value?.[service];

    if (typeof record === 'boolean') {
      next[service] = {
        ...defaults,
        connected: record,
        userId,
      };
      continue;
    }

    if (record && typeof record === 'object') {
      next[service] = {
        ...defaults,
        ...record,
        userId: record.userId || userId || null,
      };
    }
  }

  return next;
}

function normalizeStoredConnections(stored) {
  if (stored?.version === 2 && stored?.users && typeof stored.users === 'object') {
    return Object.fromEntries(
      Object.entries(stored.users).map(([userId, services]) => [userId, normalizeStoredServices(services, userId)]),
    );
  }

  if (stored && typeof stored === 'object') {
    const looksLegacy = Object.keys(DEFAULT_SERVICES).some((service) => service in stored);
    if (looksLegacy) {
      const legacyUserId = Object.values(stored).find((record) => record?.userId)?.userId || DEFAULT_USER_KEY;
      return {
        [legacyUserId]: normalizeStoredServices(stored, legacyUserId === DEFAULT_USER_KEY ? null : legacyUserId),
      };
    }
  }

  return {
    [DEFAULT_USER_KEY]: cloneDefaultServices(),
  };
}

class ConnectionStore {
  constructor() {
    const stored = readJson(FILE_NAME, { version: 2, users: { [DEFAULT_USER_KEY]: cloneDefaultServices() } });
    this.users = normalizeStoredConnections(stored);
  }

  _save() {
    writeJson(FILE_NAME, {
      version: 2,
      users: this.users,
    });
  }

  _getUserKey(userId = null) {
    return userId || DEFAULT_USER_KEY;
  }

  _ensureUser(userId = null) {
    const key = this._getUserKey(userId);
    if (!this.users[key]) {
      this.users[key] = cloneDefaultServices(userId || null);
    }

    return key;
  }

  getAll(userId = null) {
    const key = this._ensureUser(userId);
    return JSON.parse(JSON.stringify(this.users[key]));
  }

  getStatusMap(userId = null) {
    const records = this.getAll(userId);
    return Object.fromEntries(
      Object.entries(records).map(([service, record]) => [service, Boolean(record.connected)]),
    );
  }

  isConnected(service, userId = null) {
    const key = this._ensureUser(userId);
    return Boolean(this.users[key]?.[service]?.connected);
  }

  getUserId(service) {
    for (const [userId, services] of Object.entries(this.users)) {
      if (services?.[service]?.connected) {
        return userId === DEFAULT_USER_KEY ? services[service]?.userId || null : userId;
      }
    }

    return null;
  }

  setConnected(service, connected, metadata = {}) {
    const userId = metadata.userId || null;
    const key = this._ensureUser(userId);

    this.users[key][service] = {
      ...DEFAULT_SERVICES[service],
      ...this.users[key][service],
      ...(connected ? metadata : { accountId: null }),
      connected: Boolean(connected),
      userId,
      updatedAt: new Date().toISOString(),
    };

    this._save();
    return this.isConnected(service, userId);
  }
}

const connectionStore = new ConnectionStore();

module.exports = { connectionStore };
