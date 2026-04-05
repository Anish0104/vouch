import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock3, Download, Link2, ShieldAlert } from 'lucide-react';
import { apiUrl } from '../lib/api';

const statusLabels = {
  allowed: 'Allowed',
  blocked: 'Blocked',
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  error: 'Error',
};

function StatCard({ label, value, tone }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      tone === 'green'
        ? 'border-emerald-500/20 bg-emerald-500/5'
        : tone === 'amber'
          ? 'border-amber-500/20 bg-amber-500/5'
          : tone === 'red'
            ? 'border-red-500/20 bg-red-500/5'
            : 'border-vouch-border bg-black/20'
    }`}>
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

export default function AuditSnapshot() {
  const { snapshotId } = useParams();
  const [state, setState] = useState({
    loading: true,
    snapshot: null,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const response = await fetch(apiUrl(`/api/audit/share/${encodeURIComponent(snapshotId)}`));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Audit snapshot not found');
        }

        if (!cancelled) {
          setState({
            loading: false,
            snapshot: data,
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            snapshot: null,
            error: error.message,
          });
        }
      }
    }

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  async function copyShareUrl() {
    await navigator.clipboard.writeText(window.location.href);
  }

  if (state.loading) {
    return (
      <div className="glass-card p-8 text-center">
        <Clock3 className="w-8 h-8 text-vouch-cyan mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white">Loading audit snapshot</h1>
        <p className="text-sm text-gray-500 mt-2">Preparing the shareable judge view.</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="glass-card p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white">Snapshot unavailable</h1>
        <p className="text-sm text-red-300 mt-2">{state.error}</p>
        <Link to="/" className="inline-flex mt-5 btn-outline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { snapshot } = state;
  const summary = snapshot.summary || {};

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Judge Snapshot</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{snapshot.title}</h1>
            <p className="text-sm text-gray-400 mt-2 max-w-2xl">
              Shared audit evidence from Vouch. This captures the policy-enforced agent actions and outcomes at a specific point in time.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={copyShareUrl} className="btn-outline text-sm !py-2 !px-4 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Copy link
            </button>
            <Link to="/" className="btn-outline text-sm !py-2 !px-4 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Open app
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" />
            Created {snapshot.createdAt}
          </span>
          {Array.isArray(summary.services) && summary.services.length > 0 && (
            <span>Services: {summary.services.join(', ')}</span>
          )}
          {Array.isArray(summary.agents) && summary.agents.length > 0 && (
            <span>Agents: {summary.agents.join(', ')}</span>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total" value={summary.total ?? 0} />
        <StatCard label="Allowed" value={summary.allowed ?? 0} tone="green" />
        <StatCard label="Pending" value={summary.pendingApproval ?? 0} tone="amber" />
        <StatCard label="Blocked" value={summary.blocked ?? 0} tone="red" />
        <StatCard label="Errors" value={summary.errors ?? 0} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-vouch-border">
          <h2 className="text-sm font-semibold text-gray-200">Captured Events</h2>
        </div>

        <div className="divide-y divide-vouch-border/50">
          {snapshot.events.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-500 text-sm">
              No audit events were captured in this snapshot.
            </div>
          ) : (
            snapshot.events.map((event) => (
              <div key={event.id} className="px-5 py-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-mono text-white">{event.action}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-300">
                    {statusLabels[event.status] || event.status}
                  </span>
                  <span className="text-xs text-gray-500">{event.timestamp}</span>
                </div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-3">
                  <span>Agent: <span className="font-mono text-gray-300">{event.agent}</span></span>
                  <span>Service: <span className="font-mono text-gray-300">{event.service}</span></span>
                  <span>Delegation: <span className="font-mono text-gray-300">{event.delegationId || '—'}</span></span>
                </div>
                <div className="text-xs font-mono text-gray-400 break-all">{event.params || '—'}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
