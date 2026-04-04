const { readJson, writeJson } = require('./persistence');

const FILE_NAME = 'connections.json';
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

class ConnectionStore {
  constructor() {
    const stored = readJson(FILE_NAME, DEFAULT_SERVICES);
    this.services = {};

    for (const [service, defaults] of Object.entries(DEFAULT_SERVICES)) {
      const value = stored?.[service];

      if (typeof value === 'boolean') {
        this.services[service] = {
          ...defaults,
          connected: value,
        };
        continue;
      }

      this.services[service] = {
        ...defaults,
        ...(value && typeof value === 'object' ? value : {}),
      };
    }
  }

  _save() {
    writeJson(FILE_NAME, this.services);
  }

  getAll() {
    return JSON.parse(JSON.stringify(this.services));
  }

  getStatusMap() {
    return Object.fromEntries(
      Object.entries(this.services).map(([service, record]) => [service, Boolean(record.connected)]),
    );
  }

  isConnected(service) {
    return Boolean(this.services[service]?.connected);
  }

  getUserId(service) {
    return this.services[service]?.userId || null;
  }

  setConnected(service, connected, metadata = {}) {
    this.services[service] = {
      ...DEFAULT_SERVICES[service],
      ...this.services[service],
      ...(connected ? metadata : { userId: null, accountId: null }),
      connected: Boolean(connected),
      updatedAt: new Date().toISOString(),
    };
    this._save();
    return this.isConnected(service);
  }
}

const connectionStore = new ConnectionStore();

module.exports = { connectionStore };
