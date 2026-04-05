import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { Check, CheckCircle, Download, FileJson, Filter, Link2, XOctagon, Clock, ShieldCheck, ShieldOff } from 'lucide-react';
import { apiFetch, apiUrl, getApiAccessToken } from '../lib/api';
import { getRuntimeConfig } from '../lib/runtimeConfig';

const statusConfig = {
  allowed: { icon: CheckCircle, emoji: '✅', badge: 'badge-allowed', label: 'ALLOWED' },
  blocked: { icon: XOctagon, emoji: '🚫', badge: 'badge-blocked', label: 'BLOCKED' },
  pending_approval: { icon: Clock, emoji: '⏳', badge: 'badge-pending', label: 'PENDING' },
  approved: { icon: ShieldCheck, emoji: '✅', badge: 'badge-approved', label: 'APPROVED' },
  rejected: { icon: ShieldOff, emoji: '🚫', badge: 'badge-rejected', label: 'REJECTED' },
  error: { icon: XOctagon, emoji: '❌', badge: 'badge-blocked', label: 'ERROR' },
};

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error || 'Request failed';
  } catch {
    return 'Request failed';
  }
}

function AuditLogBody({ compact = false, getAccessTokenSilently = null, liveMode = false }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isConnected, setIsConnected] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [shareState, setShareState] = useState({
    url: '',
    copied: false,
    error: '',
  });
  const eventSourceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let es = null;

    async function connect() {
      try {
        const response = await apiFetch('/api/audit', { getAccessTokenSilently });
        const data = await response.json();
        if (!cancelled) {
          setEvents(data.events || []);
        }
      } catch {}

      try {
        const accessToken = liveMode ? await getApiAccessToken(getAccessTokenSilently) : null;
        const streamUrl = liveMode && accessToken
          ? `${apiUrl('/api/audit/stream')}?access_token=${encodeURIComponent(accessToken)}`
          : apiUrl('/api/audit/stream');

        es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => setIsConnected(true);

        es.addEventListener('action', (e) => {
          try {
            const event = JSON.parse(e.data);
            setEvents((prev) => {
              const exists = prev.find((ev) => ev.id === event.id);
              if (exists) return prev;
              return [event, ...prev].slice(0, 200);
            });
          } catch {}
        });

        es.onerror = () => setIsConnected(false);
      } catch {
        if (!cancelled) {
          setIsConnected(false);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (es) {
        es.close();
      }
    };
  }, [getAccessTokenSilently, liveMode]);

  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter);
  const displayed = compact ? filtered.slice(0, 10) : filtered;

  async function downloadExport(format) {
    const query = new URLSearchParams({
      format,
      limit: '200',
    });

    if (filter !== 'all') {
      query.set('status', filter);
    }

    setBusyAction(format);

    try {
      const response = await apiFetch(`/api/audit/export?${query.toString()}`, {
        getAccessTokenSilently,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vouch-audit.${format === 'csv' ? 'csv' : 'json'}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setShareState((current) => ({
        ...current,
        error: error.message,
      }));
    } finally {
      setBusyAction('');
    }
  }

  async function createShareSnapshot() {
    setBusyAction('share');
    setShareState((current) => ({
      ...current,
      error: '',
    }));

    try {
      const response = await apiFetch('/api/audit/share', {
        method: 'POST',
        getAccessTokenSilently,
        body: {
          title: 'Vouch Judge Snapshot',
          limit: 200,
          ...(filter !== 'all' ? { status: filter } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create share link');
      }

      await navigator.clipboard.writeText(data.shareUrl);
      setShareState({
        url: data.shareUrl,
        copied: true,
        error: '',
      });

      window.setTimeout(() => {
        setShareState((current) => ({
          ...current,
          copied: false,
        }));
      }, 2000);
    } catch (error) {
      setShareState((current) => ({
        ...current,
        error: error.message,
      }));
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-vouch-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">Audit Log</h2>
          <div className="flex items-center gap-1.5">
            <div className={`pulse-dot ${isConnected ? 'green' : 'red'}`} />
            <span className="text-xs text-gray-500">{isConnected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-gray-500 mr-1" />
              {['all', 'allowed', 'blocked', 'pending_approval'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                    filter === f
                      ? 'bg-vouch-purple/20 text-vouch-purple-light'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'pending_approval' ? 'Pending' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <button
              onClick={() => downloadExport('json')}
              disabled={busyAction !== ''}
              className="btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              <FileJson className="w-3.5 h-3.5" />
              {busyAction === 'json' ? 'Exporting...' : 'JSON'}
            </button>
            <button
              onClick={() => downloadExport('csv')}
              disabled={busyAction !== ''}
              className="btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {busyAction === 'csv' ? 'Exporting...' : 'CSV'}
            </button>
            <button
              onClick={createShareSnapshot}
              disabled={busyAction !== ''}
              className="btn-outline text-xs !py-1.5 !px-3 flex items-center gap-1.5"
            >
              {shareState.copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Link2 className="w-3.5 h-3.5" />}
              {busyAction === 'share' ? 'Sharing...' : shareState.copied ? 'Link Copied' : 'Share'}
            </button>
          </div>
        )}
      </div>

      {/* Events */}
      <div ref={containerRef} className={`overflow-y-auto ${compact ? 'max-h-[400px]' : 'max-h-[600px]'}`}>
        <AnimatePresence initial={false}>
          {displayed.length === 0 ? (
            <div className="px-5 py-12 text-center text-gray-500 text-sm">
              No events yet. Agent actions will appear here in real-time.
            </div>
          ) : (
            displayed.map((event, index) => {
              const cfg = statusConfig[event.status] || statusConfig.error;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={event.id + '_' + index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-4 px-5 py-3 border-b border-vouch-border/50 hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Status Icon */}
                  <span className="text-base flex-shrink-0">{cfg.emoji}</span>

                  {/* Agent */}
                  <span className="text-xs font-mono text-gray-400 w-28 truncate flex-shrink-0">
                    {event.agent}
                  </span>

                  {/* Action */}
                  <span className="text-sm font-medium text-gray-200 w-44 truncate flex-shrink-0 font-mono">
                    {event.action}
                  </span>

                  {/* Params */}
                  <span className="text-xs text-gray-500 truncate flex-1 font-mono min-w-0">
                    {event.params || '—'}
                  </span>

                  {/* Status Badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>

                  {/* Time */}
                  <span className="text-xs text-gray-600 w-16 text-right flex-shrink-0">
                    {timeAgo(event.timestamp)}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      {!compact && events.length > 0 && (
        <div className="px-5 py-3 border-t border-vouch-border text-xs text-gray-500 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
          <span>
            {events.filter((e) => e.status === 'blocked').length} blocked ·{' '}
            {events.filter((e) => e.status === 'pending_approval').length} pending
          </span>
          {(shareState.url || shareState.error) && (
            <span className={shareState.error ? 'text-red-300' : 'text-vouch-cyan'}>
              {shareState.error || shareState.url}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LiveAuditLog(props) {
  const { getAccessTokenSilently } = useAuth0();
  return <AuditLogBody {...props} liveMode getAccessTokenSilently={getAccessTokenSilently} />;
}

export default function AuditLog(props) {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveAuditLog {...props} /> : <AuditLogBody {...props} />;
}
