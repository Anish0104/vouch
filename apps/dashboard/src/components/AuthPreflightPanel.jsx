import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { apiUrl } from '../lib/api';

function StatusBadge({ ok, label }) {
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
      ok
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
        : 'bg-amber-500/15 text-amber-200 border-amber-500/20'
    }`}
    >
      {label}
    </span>
  );
}

function summarizeIssues(preflight, currentOrigin) {
  const issues = [
    ...(preflight?.runtime?.issues || []),
    ...(preflight?.client?.issues || []),
    ...(preflight?.grant?.issues || []),
    ...(preflight?.services || []).flatMap((service) => service.issues || []),
  ];

  const configuredFrontendUrl = preflight?.environment?.frontendUrl || '';
  if (configuredFrontendUrl && currentOrigin && configuredFrontendUrl !== currentOrigin) {
    issues.unshift({
      message: `You opened the dashboard at ${currentOrigin}, but Auth0 is configured for ${configuredFrontendUrl}.`,
      severity: 'warning',
    });
  }

  return issues;
}

function formatLogTimestamp(value) {
  if (!value) return 'Unknown time';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function hasMissingRefreshTokenFailure(service) {
  const summary = String(service?.recentActivity?.lastError?.summary || '').toLowerCase();
  const detail = String(service?.recentActivity?.lastError?.detail || '').toLowerCase();
  return `${summary} ${detail}`.includes('missing refresh token');
}

export default function AuthPreflightPanel() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    preflight: null,
  });

  async function loadPreflight() {
    setState((current) => ({ ...current, loading: true, error: '' }));

    try {
      const response = await fetch(apiUrl('/api/auth/preflight'));
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load Auth0 preflight diagnostics');
      }

      setState({
        loading: false,
        error: '',
        preflight: data,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error.message,
        preflight: null,
      });
    }
  }

  useEffect(() => {
    loadPreflight();
  }, []);

  const currentOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const issues = summarizeIssues(state.preflight, currentOrigin);

  if (state.loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 flex items-center gap-3"
      >
        <Loader2 className="w-5 h-5 text-vouch-cyan animate-spin" />
        <div>
          <p className="text-sm font-medium text-gray-200">Checking Auth0 preflight</p>
          <p className="text-xs text-gray-500 mt-0.5">Inspecting the tenant, SPA client grant, and service connections.</p>
        </div>
      </motion.div>
    );
  }

  if (state.error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 border border-red-500/20"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Auth0 preflight failed</p>
              <p className="text-xs text-red-200/80 mt-1">{state.error}</p>
            </div>
          </div>
          <button onClick={loadPreflight} className="btn-outline text-xs flex items-center gap-1.5 !py-1.5 !px-3">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  const { preflight } = state;
  const configuredFrontendUrl = preflight?.environment?.frontendUrl || '';
  const recommendedFixes = preflight?.recommendedFixes || [];
  const logIssues = preflight?.logs?.issues || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6 space-y-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-vouch-emerald mt-0.5" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-200">Auth0 Connection Preflight</p>
              <StatusBadge ok={Boolean(preflight?.ok)} label={preflight?.ok ? 'Ready' : 'Needs fixes'} />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Checks the Auth0 tenant, SPA app allowlists, My Account client grant, and the configured GitHub/Linear connections before you retry the hosted flow.
            </p>
          </div>
        </div>

        <button onClick={loadPreflight} className="btn-outline text-xs flex items-center gap-1.5 !py-1.5 !px-3">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-vouch-border bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Auth0 Domain</p>
          <p className="text-sm text-gray-200 mt-1 font-mono break-all">{preflight?.environment?.auth0Domain || 'Missing'}</p>
        </div>
        <div className="rounded-xl border border-vouch-border bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">SPA Client</p>
          <p className="text-sm text-gray-200 mt-1 font-mono break-all">{preflight?.environment?.spaClientId || 'Missing'}</p>
        </div>
        <div className="rounded-xl border border-vouch-border bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Configured Frontend URL</p>
          <p className="text-sm text-gray-200 mt-1 font-mono break-all">{configuredFrontendUrl || 'Missing'}</p>
        </div>
        <div className="rounded-xl border border-vouch-border bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">Current Browser Origin</p>
          <p className={`text-sm mt-1 font-mono break-all ${configuredFrontendUrl && currentOrigin === configuredFrontendUrl ? 'text-emerald-300' : 'text-amber-200'}`}>
            {currentOrigin || 'Unavailable'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {issues.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-300">No obvious Auth0 misconfiguration detected</p>
              <p className="text-xs text-emerald-200/80 mt-1">
                If the hosted Auth0 page still returns <span className="font-mono">invalid_request</span>, the remaining likely cause is the connection’s provider setup in Auth0 itself.
              </p>
            </div>
          </div>
        ) : (
          issues.map((issue, index) => (
            <div key={`${issue.message}_${index}`} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5" />
              <p className="text-sm text-amber-100/90">{issue.message}</p>
            </div>
          ))
        )}
      </div>

      {logIssues.length > 0 && (
        <div className="space-y-3">
          {logIssues.map((issue, index) => (
            <div key={`${issue.message}_${index}`} className="rounded-xl border border-vouch-cyan/20 bg-vouch-cyan/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-vouch-cyan mt-0.5" />
              <p className="text-sm text-cyan-100/90">{issue.message}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(preflight?.services || []).map((service) => (
          <div key={service.serviceId} className="rounded-xl border border-vouch-border bg-black/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-200 capitalize">{service.serviceId}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{service.connectionName}</p>
              </div>
              <StatusBadge
                ok={Boolean(service.ok)}
                label={service.required ? (service.ok ? 'Configured' : 'Action needed') : (service.connection.found ? 'Optional' : 'Optional')}
              />
            </div>

            <div className="text-xs text-gray-400 space-y-1">
              <p>Required: <span className={service.required ? 'text-gray-200' : 'text-gray-500'}>{service.required ? 'Yes' : 'No'}</span></p>
              <p>Found: <span className={service.connection.found ? 'text-emerald-300' : 'text-red-300'}>{service.connection.found ? 'Yes' : 'No'}</span></p>
              <p>Strategy: <span className="text-gray-300 font-mono">{service.connection.strategy || 'Unknown'}</span></p>
              <p>Enabled for SPA: <span className={service.connection.enabledForSpa ? 'text-emerald-300' : 'text-red-300'}>{service.connection.enabledForSpa ? 'Yes' : 'No'}</span></p>
              <p>Connected Accounts: <span className={service.connection.connectedAccountsActive ? 'text-emerald-300' : 'text-red-300'}>{service.connection.connectedAccountsActive ? 'Enabled' : 'Disabled or unknown'}</span></p>
            </div>

            {hasMissingRefreshTokenFailure(service) && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-200">Refresh Token Required</p>
                <p className="text-xs text-red-100 mt-1">
                  GitHub approved the app, but Auth0 did not receive a refresh token to store in Token Vault.
                </p>
                <p className="text-xs text-red-200/80 mt-2">
                  This is usually fixed in the GitHub App and Auth0 connection settings, not in the React app.
                </p>
              </div>
            )}

            {service.issues?.length > 0 && (
              <div className="space-y-2">
                {service.issues.map((issue, index) => (
                  <div
                    key={`${service.serviceId}_issue_${index}`}
                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-amber-200">Service Issue</p>
                    <p className="text-xs text-amber-100 mt-1">{issue.message}</p>
                  </div>
                ))}
              </div>
            )}

            {service.recentActivity?.lastError && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-amber-200">Recent Auth0 failure</p>
                <p className="text-xs text-amber-100 mt-1">{service.recentActivity.lastError.summary}</p>
                {service.recentActivity.lastError.detail && (
                  <p className="text-xs text-amber-200/80 mt-1 font-mono break-words">{service.recentActivity.lastError.detail}</p>
                )}
                <p className="text-[10px] text-amber-200/70 mt-2 font-mono">
                  {formatLogTimestamp(service.recentActivity.lastError.date)}
                  {service.recentActivity.lastError.type ? ` • ${service.recentActivity.lastError.type}` : ''}
                </p>
              </div>
            )}

            {!service.recentActivity?.lastError && service.recentActivity?.lastEvent && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-200">Latest Auth0 activity</p>
                <p className="text-xs text-emerald-100 mt-1">{service.recentActivity.lastEvent.summary}</p>
                <p className="text-[10px] text-emerald-200/70 mt-2 font-mono">
                  {formatLogTimestamp(service.recentActivity.lastEvent.date)}
                  {service.recentActivity.lastEvent.type ? ` • ${service.recentActivity.lastEvent.type}` : ''}
                </p>
              </div>
            )}

            {service.fixes?.length > 0 && (
              <div className="rounded-xl border border-vouch-purple/20 bg-vouch-purple/10 p-3">
                <p className="text-[10px] uppercase tracking-wider text-vouch-purple-light">Service Fixes</p>
                <div className="space-y-2 mt-2">
                  {service.fixes.map((fix, index) => (
                    <p key={`${service.serviceId}_fix_${index}`} className="text-xs text-gray-200/90">
                      {fix.message}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {service.docsUrl && (
              <a
                href={service.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-vouch-cyan hover:text-vouch-cyan-light transition-colors inline-flex items-center gap-1"
              >
                Open {service.serviceId} docs <RefreshCw className="w-3 h-3" />
              </a>
            )}
          </div>
        ))}
      </div>

      {recommendedFixes.length > 0 && (
        <div className="rounded-xl border border-vouch-purple/20 bg-vouch-purple/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-vouch-purple-light" />
            <p className="text-sm font-semibold text-gray-200">Recommended Fixes</p>
          </div>
          <div className="space-y-2">
            {recommendedFixes.map((fix) => (
              <p key={fix.message} className="text-xs text-gray-300">
                {fix.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
