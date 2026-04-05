import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { AlertTriangle, Bot, Clock3, Lock, Shield, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { loadLatestInvite } from '../lib/invite';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function pickActiveDelegation(delegations, sessions) {
  if (!Array.isArray(delegations) || delegations.length === 0) {
    return null;
  }

  const latestInvite = loadLatestInvite();
  const activeDelegationId = sessions?.[0]?.delegationId || latestInvite?.delegationId || '';

  return delegations.find((delegation) => delegation.delegationId === activeDelegationId) || delegations[0];
}

function PreviewList({ items, tone }) {
  if (!items.length) {
    return <span className="text-xs text-gray-600">None configured</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`text-[11px] font-mono px-2 py-1 rounded-full border ${
            tone === 'allow'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : tone === 'stepup'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function RiskSummaryCardBody({ getAccessTokenSilently = null }) {
  const [state, setState] = useState({
    loading: true,
    delegation: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [delegationsRes, sessionsRes] = await Promise.all([
          apiFetch('/api/delegate', { getAccessTokenSilently }),
          apiFetch('/api/audit/sessions', { getAccessTokenSilently }),
        ]);

        const [delegationsData, sessionsData] = await Promise.all([
          delegationsRes.json(),
          sessionsRes.json(),
        ]);

        if (cancelled) {
          return;
        }

        setState({
          loading: false,
          delegation: pickActiveDelegation(delegationsData.delegations || [], sessionsData.sessions || []),
        });
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            loading: false,
          }));
        }
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [getAccessTokenSilently]);

  if (state.loading) {
    return (
      <div className="glass-card p-5">
        <p className="text-sm text-gray-400">Loading risk summary...</p>
      </div>
    );
  }

  if (!state.delegation) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-vouch-cyan" />
          <h2 className="text-sm font-semibold text-gray-200">Risk Summary</h2>
        </div>
        <p className="text-sm text-gray-400">No active delegation yet. Generate a demo scenario to seed a safe default policy.</p>
      </div>
    );
  }

  const {
    agentId,
    expiresAt,
    services = [],
    summary = {},
    allow = [],
    stepUpRequired = [],
    deny = [],
  } = state.delegation;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-vouch-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vouch-cyan/20 to-vouch-purple/10 border border-vouch-border flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-vouch-cyan" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-200">Risk Summary</h2>
          <p className="text-[11px] text-gray-500">Live policy posture for the active agent</p>
        </div>
        <Link to="/policy" className="text-xs text-vouch-cyan hover:text-vouch-purple-light transition-colors">
          Tune policy
        </Link>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5" />
            {agentId}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" />
            Expires {expiresAt}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300">Allow</p>
            <p className="text-xl font-semibold text-white mt-1">{summary.allowCount ?? allow.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-300">Step-Up</p>
            <p className="text-xl font-semibold text-white mt-1">{summary.stepUpCount ?? stepUpRequired.length}</p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-red-300">Deny</p>
            <p className="text-xl font-semibold text-white mt-1">{summary.denyCount ?? deny.length}</p>
          </div>
        </div>

        {services.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {services.map((service) => (
              <span key={service} className="text-[11px] uppercase tracking-wider px-2 py-1 rounded-full border border-white/10 text-gray-400 bg-white/[0.03]">
                {service}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Safe defaults</p>
            <PreviewList items={allow.slice(0, 3)} tone="allow" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Human approval required</p>
            <PreviewList items={stepUpRequired.slice(0, 3)} tone="stepup" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Hard-blocked
            </p>
            <PreviewList items={deny.slice(0, 3)} tone="deny" />
          </div>
        </div>

        <div className="rounded-xl border border-vouch-border bg-black/20 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400">
            Routine actions flow automatically, risky actions require human approval, and destructive actions are blocked before the agent can execute them.
          </p>
        </div>
      </div>
    </div>
  );
}

function LiveRiskSummaryCard() {
  const { getAccessTokenSilently } = useAuth0();
  return <RiskSummaryCardBody getAccessTokenSilently={getAccessTokenSilently} />;
}

export default function RiskSummaryCard() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveRiskSummaryCard /> : <RiskSummaryCardBody />;
}
