const { v4: uuidv4 } = require('uuid');
const { readJson, writeJson } = require('./persistence');

const FILE_NAME = 'audit-snapshots.json';
const MAX_SNAPSHOTS = 50;

class AuditSnapshotStore {
  constructor() {
    const storedSnapshots = readJson(FILE_NAME, []);
    this.snapshots = new Map();

    for (const snapshot of Array.isArray(storedSnapshots) ? storedSnapshots : []) {
      if (snapshot?.snapshotId) {
        this.snapshots.set(snapshot.snapshotId, snapshot);
      }
    }
  }

  _save() {
    const snapshots = Array.from(this.snapshots.values())
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, MAX_SNAPSHOTS);

    this.snapshots = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
    writeJson(FILE_NAME, snapshots);
  }

  create({ title, userId, filters, summary, events }) {
    const snapshot = {
      snapshotId: `shr_${uuidv4().replace(/-/g, '').slice(0, 12)}`,
      title: typeof title === 'string' && title.trim() ? title.trim() : 'Vouch Audit Snapshot',
      userId: userId || null,
      filters: filters || {},
      summary: summary || {},
      events: Array.isArray(events) ? events : [],
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(snapshot.snapshotId, snapshot);
    this._save();
    return snapshot;
  }

  get(snapshotId) {
    return this.snapshots.get(snapshotId) || null;
  }
}

const auditSnapshotStore = new AuditSnapshotStore();

module.exports = {
  auditSnapshotStore,
};
