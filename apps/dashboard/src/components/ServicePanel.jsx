import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { AlertTriangle, CheckCircle2, Loader2, ExternalLink, Link2Off, LogIn } from 'lucide-react';
import { apiFetch, apiUrl } from '../lib/api';
import {
  buildMyAccountAuthorizationParams,
  consumePendingServiceConnect,
  getConnectionName,
  recordConnectionState,
  requiresInteractiveConnectedAccountLogin,
  setPendingServiceConnect,
} from '../lib/connectedAccounts';
import { getRuntimeConfig } from '../lib/runtimeConfig';

const serviceConfig = {
  github: {
    name: 'GitHub',
    icon: '🐙',
    description: 'Repositories, branches, pull requests, code',
    scopes: [],
    permissionsNote: 'Permissions are configured on the GitHub App in GitHub Developer Settings.',
    color: 'from-gray-700 to-gray-900',
    docUrl: 'https://auth0.com/ai/docs/integrations/github',
  },
  linear: {
    name: 'Linear',
    icon: '📐',
    description: 'Issues, projects, teams, cycles',
    scopes: ['read', 'write', 'issues:create'],
    permissionsNote: 'Requires a Linear OAuth app and an Auth0 custom social connection for Connected Accounts.',
    color: 'from-indigo-800 to-violet-900',
    docUrl: 'https://linear.app/developers/oauth-2-0-authentication',
  },
};

function buildInteractiveConnectAuthorizationParams(forceFreshSession = false) {
  return buildMyAccountAuthorizationParams({
    prompt: forceFreshSession ? 'login consent' : 'consent',
    ...(forceFreshSession ? { max_age: 0 } : {}),
  });
}

function formatConnectedAccountError(error) {
  const validationDetails = Array.isArray(error?.validation_errors)
    ? error.validation_errors
        .map((entry) => entry?.detail || entry?.field || entry?.pointer || '')
        .filter(Boolean)
    : [];

  if (validationDetails.length > 0) {
    return `${error.message}: ${validationDetails.join(' ')}`;
  }

  return error?.message || 'Connected Accounts request failed';
}

function isLegacyGitHubSignInRecord(record) {
  return Boolean(
    record?.connected
    && typeof record.userId === 'string'
    && record.userId.startsWith('github|')
    && record.userId === record.accountId,
  );
}

function ServiceCard({ id, config, connected, isLoading, onToggle, identityBacked = false }) {
  const badgeLabel = connected
    ? 'Connected'
    : identityBacked
      ? 'Using sign-in'
      : '';
  const buttonLabel = connected
    ? 'Disconnect'
    : identityBacked
      ? 'Use sign-in'
      : 'Connect';

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card glass-card-hover overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${config.color} flex items-center justify-center text-xl shadow-lg border border-white/10`}>
              {config.icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                {config.name}
                {badgeLabel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                    connected
                      ? 'badge-allowed'
                      : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                  }`}
                  >
                    {badgeLabel}
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
            </div>
          </div>

          <button
            onClick={() => onToggle(id)}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              connected
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                : identityBacked
                  ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/20 hover:bg-cyan-500/20'
                : 'btn-glow !py-2 !px-4'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : connected ? (
              <>
                <Link2Off className="w-4 h-4" />
                {buttonLabel}
              </>
            ) : (
              <span>{buttonLabel}</span>
            )}
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-vouch-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {config.scopes.length > 0 ? (
                <>
                  <span className="text-xs text-gray-500">Scopes:</span>
                  {config.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 text-gray-400 font-mono border border-vouch-border/50"
                    >
                      {scope}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-xs text-gray-500">{config.permissionsNote || 'Permissions are configured on the provider.'}</span>
              )}
            </div>
            <a
              href={config.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-vouch-purple-light transition-colors flex items-center gap-1"
            >
              Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {(connected || identityBacked) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-vouch-border/50"
          >
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-vouch-emerald" />
              <span className="text-gray-400">
                {connected
                  ? 'Connected Account linked for Token Vault'
                  : identityBacked
                  ? 'GitHub access is available through your Auth0 sign-in'
                  : 'Connected Account linked for Token Vault'}
              </span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">
                {connected
                  ? 'Agent never sees this credential'
                  : identityBacked
                  ? 'Vouch can use your GitHub sign-in token when Token Vault refresh tokens are unavailable'
                  : 'Agent never sees this credential'}
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function DemoServicePanel() {
  const [services, setServices] = useState({ github: false, linear: false });
  const [loading, setLoading] = useState({});

  useEffect(() => {
    fetch(apiUrl('/api/auth/status'))
      .then((r) => r.json())
      .then((data) => {
        if (data.services) setServices(data.services);
      })
      .catch(() => {});
  }, []);

  async function toggleService(serviceId) {
    const connected = services[serviceId];
    setLoading((l) => ({ ...l, [serviceId]: true }));

    try {
      const endpoint = connected ? 'disconnect' : 'connect';
      const res = await fetch(apiUrl(`/api/auth/${endpoint}/${serviceId}`), { method: 'POST' });
      const data = await res.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
        return;
      }

      setServices((s) => ({ ...s, [serviceId]: !connected }));
    } catch {
      // Ignore demo flow errors.
    } finally {
      setLoading((l) => ({ ...l, [serviceId]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {Object.entries(serviceConfig).map(([id, config]) => (
        <ServiceCard
          key={id}
          id={id}
          config={config}
          connected={services[id]}
          isLoading={loading[id]}
          onToggle={toggleService}
        />
      ))}
    </div>
  );
}

function LiveServicePanel() {
  const {
    isAuthenticated,
    isLoading: authLoading,
    loginWithRedirect,
    connectAccountWithRedirect,
    getAccessTokenSilently,
    user,
  } = useAuth0();
  const [services, setServices] = useState({ github: false, linear: false });
  const [loading, setLoading] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [hasResumedPendingConnect, setHasResumedPendingConnect] = useState(false);

  async function refreshStatus() {
    try {
      const response = await apiFetch('/api/auth/status', {
        getAccessTokenSilently: isAuthenticated ? getAccessTokenSilently : null,
      });
      const data = await response.json();
      if (data.services) {
        const nextServices = { ...data.services };
        if (isLegacyGitHubSignInRecord(data.details?.github)) {
          nextServices.github = false;
        }
        setServices(nextServices);
      }
    } catch {
      // Keep previous state when the API is unavailable.
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || authLoading || hasResumedPendingConnect) {
      return;
    }

    const pendingService = consumePendingServiceConnect();
    setHasResumedPendingConnect(true);

    if (!pendingService) {
      return;
    }

    handleToggleService(pendingService);
  }, [authLoading, hasResumedPendingConnect, isAuthenticated]);

  async function handleToggleService(serviceId) {
    const connected = services[serviceId];
    const identityBacked = serviceId === 'github' && Boolean(user?.sub?.startsWith('github|'));
    setErrorMessage('');
    setNoticeMessage('');
    setLoading((current) => ({ ...current, [serviceId]: true }));

    try {
      if (connected) {
        await recordConnectionState({
          serviceId,
          connected: false,
          getAccessTokenSilently,
        });
        await refreshStatus();
        return;
      }

      if (!isAuthenticated) {
        setPendingServiceConnect(serviceId);
        await loginWithRedirect({
          appState: { returnTo: '/connect' },
          authorizationParams: buildInteractiveConnectAuthorizationParams(true),
        });
        return;
      }

      if (identityBacked) {
        setNoticeMessage('GitHub is ready through your Auth0 sign-in. Vouch will fall back to your GitHub identity token so you can keep demoing without the failing refresh-token setup.');
        return;
      }

      const connectOptions = {
        connection: getConnectionName(serviceId),
        redirectUri: `${window.location.origin}/callback`,
        appState: {
          returnTo: `/callback?service=${serviceId}&connected=true`,
          serviceId,
        },
      };
      const scopes = serviceConfig[serviceId]?.scopes || [];
      if (scopes.length > 0) {
        connectOptions.scopes = scopes;
      }

      await connectAccountWithRedirect({
        ...connectOptions,
      });
    } catch (error) {
      if (requiresInteractiveConnectedAccountLogin(error)) {
        setPendingServiceConnect(serviceId);
        await loginWithRedirect({
          appState: { returnTo: '/connect' },
          authorizationParams: buildInteractiveConnectAuthorizationParams(true),
        });
        return;
      }

      setErrorMessage(formatConnectedAccountError(error));
    } finally {
      setLoading((current) => ({ ...current, [serviceId]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {!isAuthenticated && !authLoading && (
        <div className="glass-card p-4 flex items-start gap-3 border border-vouch-cyan/20">
          <LogIn className="w-5 h-5 text-vouch-cyan mt-0.5" />
          <div className="text-sm text-gray-300">
            Click <span className="text-white font-medium">Connect</span> on any service to sign in with Auth0 and start the Connected Accounts flow.
          </div>
        </div>
      )}

      {isAuthenticated && user?.email && (
        <div className="glass-card p-4 text-sm text-gray-400">
          Connected accounts will be linked to <span className="text-gray-200 font-medium">{user.email}</span>.
        </div>
      )}

      {errorMessage && (
        <div className="glass-card p-4 flex items-start gap-3 border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
          <p className="text-sm text-red-300">{errorMessage}</p>
        </div>
      )}

      {noticeMessage && (
        <div className="glass-card p-4 flex items-start gap-3 border border-emerald-500/20">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
          <p className="text-sm text-emerald-200">{noticeMessage}</p>
        </div>
      )}

      {Object.entries(serviceConfig).map(([id, config]) => (
        (() => {
          const identityBacked = id === 'github' && Boolean(user?.sub?.startsWith('github|'));
          return (
        <ServiceCard
          key={id}
          id={id}
          config={config}
          connected={Boolean(services[id])}
          isLoading={loading[id] || authLoading}
          onToggle={handleToggleService}
          identityBacked={identityBacked}
        />
          );
        })()
      ))}
    </div>
  );
}

export default function ServicePanel() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveServicePanel /> : <DemoServicePanel />;
}
