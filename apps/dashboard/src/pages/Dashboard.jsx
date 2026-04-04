import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, GitBranch, AlertTriangle, Clock, ArrowUpRight } from 'lucide-react';
import AuditLog from '../components/AuditLog';
import IncidentFeed from '../components/IncidentFeed';
import StepUpModal from '../components/StepUpModal';
import AgentInvite from '../components/AgentInvite';
import { apiUrl } from '../lib/api';

function getWindowedCount(events, status, durationMs) {
  const cutoff = Date.now() - durationMs;
  return events.filter((event) => {
    if (status && event.status !== status) return false;
    return new Date(event.timestamp).getTime() >= cutoff;
  }).length;
}

export default function Dashboard() {
  const [stats, setStats] = useState([
    {
      label: 'Actions Processed',
      value: '0',
      change: 'Waiting for activity',
      color: 'from-vouch-purple to-vouch-purple-dark',
      icon: Shield,
    },
    {
      label: 'Threats Blocked',
      value: '0',
      change: 'No policy violations yet',
      color: 'from-red-600 to-red-700',
      icon: AlertTriangle,
    },
    {
      label: 'Active Agents',
      value: '0',
      change: 'No active delegations',
      color: 'from-vouch-cyan to-cyan-700',
      icon: GitBranch,
    },
    {
      label: 'Pending Approvals',
      value: '0',
      change: 'Nothing waiting on you',
      color: 'from-amber-500 to-amber-600',
      icon: Clock,
    },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStats() {
      try {
        const [auditRes, sessionsRes, pendingRes] = await Promise.all([
          fetch(apiUrl('/api/audit?limit=200')),
          fetch(apiUrl('/api/audit/sessions')),
          fetch(apiUrl('/api/audit/pending')),
        ]);

        const [auditData, sessionsData, pendingData] = await Promise.all([
          auditRes.json(),
          sessionsRes.json(),
          pendingRes.json(),
        ]);

        if (cancelled) return;

        const events = auditData.events || [];
        const sessions = sessionsData.sessions || [];
        const pending = pendingData.pending || [];
        const activeAgentNames = sessions.map((session) => session.agent).filter(Boolean);
        const pendingHeadline = pending[0]
          ? `${pending[0].service}.${pending[0].action}`
          : 'Nothing waiting on you';

        setStats([
          {
            label: 'Actions Processed',
            value: String(events.length),
            change: `${getWindowedCount(events, null, 24 * 60 * 60 * 1000)} in last 24h`,
            color: 'from-vouch-purple to-vouch-purple-dark',
            icon: Shield,
          },
          {
            label: 'Threats Blocked',
            value: String(events.filter((event) => event.status === 'blocked').length),
            change: `${getWindowedCount(events, 'blocked', 60 * 60 * 1000)} in last hour`,
            color: 'from-red-600 to-red-700',
            icon: AlertTriangle,
          },
          {
            label: 'Active Agents',
            value: String(activeAgentNames.length),
            change: activeAgentNames.length ? activeAgentNames.join(', ') : 'No active delegations',
            color: 'from-vouch-cyan to-cyan-700',
            icon: GitBranch,
          },
          {
            label: 'Pending Approvals',
            value: String(pending.length),
            change: pendingHeadline,
            color: 'from-amber-500 to-amber-600',
            icon: Clock,
          },
        ]);
      } catch {
        // Keep the last known values if the dashboard cannot reach the API.
      }
    }

    refreshStats();
    const interval = window.setInterval(refreshStats, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-8">
      <StepUpModal />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden glass-card p-8"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-vouch-purple/10 via-transparent to-vouch-cyan/10" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-vouch-purple-light" />
            <span className="text-xs font-semibold text-vouch-purple-light uppercase tracking-wider">Vouch Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Your AI agents. <span className="gradient-text">Under your control.</span>
          </h1>
          <p className="text-sm text-gray-400 max-w-2xl">
            Monitor every action, enforce policy-as-code, approve write operations — all without
            the agent ever touching your credentials. Powered by Auth0 Token Vault.
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card glass-card-hover p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
              <p className="text-[11px] text-gray-600 mt-0.5">{stat.change}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AuditLog />
        </div>

        <div className="space-y-6">
          <IncidentFeed />
          <AgentInvite />
        </div>
      </div>
    </div>
  );
}
