import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Clock, Shield, AlertTriangle, Zap } from 'lucide-react';
import { apiUrl } from '../lib/api';

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export default function IncidentFeed() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    fetch(apiUrl('/api/audit/sessions'))
      .then((r) => r.json())
      .then((data) => setSessions(data.sessions || []))
      .catch(() => {});

    const interval = setInterval(() => {
      fetch(apiUrl('/api/audit/sessions'))
        .then((r) => r.json())
        .then((data) => setSessions(data.sessions || []))
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-vouch-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-vouch-cyan" />
          Active Sessions
        </h2>
        <span className="text-xs text-gray-500">{sessions.length} agent{sessions.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-vouch-border/50">
        <AnimatePresence>
          {sessions.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              No active sessions
            </div>
          ) : (
            sessions.map((session, i) => (
              <motion.div
                key={session.agent}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vouch-purple/30 to-vouch-cyan/20 flex items-center justify-center border border-vouch-border">
                      <Bot className="w-4 h-4 text-vouch-purple-light" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-200">{session.agent}</p>
                      <p className="text-xs text-gray-500 font-mono">{session.delegationId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="pulse-dot green" />
                    <span className="text-xs text-gray-500">Active</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-vouch-emerald" />
                    <span className="text-xs text-gray-400">{session.totalActions} actions</span>
                  </div>
                  {session.blockedActions > 0 && (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-xs text-red-400">{session.blockedActions} blocked</span>
                    </div>
                  )}
                  {session.pendingApprovals > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-amber-400">{session.pendingApprovals} pending</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-600 ml-auto">{timeAgo(session.lastSeen)}</span>
                </div>

                {/* Last action */}
                <div className="mt-2 text-xs text-gray-500">
                  Last: <span className="font-mono text-gray-400">{session.lastAction}</span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
