import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { CheckCircle2, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';
import {
  consumeConnectedAccountResult,
  recordConnectionState,
} from '../lib/connectedAccounts';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function CallbackCard({ title, description, error = false, loading = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-8 max-w-2xl"
    >
      <div className="flex items-center gap-3 mb-4">
        {loading ? (
          <Loader2 className="w-6 h-6 text-vouch-cyan animate-spin" />
        ) : error ? (
          <ShieldAlert className="w-6 h-6 text-red-400" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${error ? 'text-red-300' : loading ? 'text-vouch-cyan' : 'text-emerald-300'}`}>
          Auth Callback
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className={`text-sm mt-2 ${error ? 'text-red-300' : 'text-gray-400'}`}>{description}</p>

      <div className="flex flex-wrap gap-3 mt-6">
        <Link to="/connect" className="btn-glow inline-flex items-center gap-2">
          Back to Connect
        </Link>
        <Link to="/" className="btn-outline inline-flex items-center gap-2">
          Open Dashboard <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}

function BasicAuthCallback() {
  const [searchParams] = useSearchParams();
  const service = searchParams.get('service');
  const connected = searchParams.get('connected') === 'true';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const title = error
    ? 'Connection failed'
    : connected
      ? `${service || 'Service'} connected`
      : 'Authentication complete';

  const description = error
    ? errorDescription || error
    : connected
      ? `Vouch can now request ${service || 'service'} actions without exposing the underlying OAuth credential to the agent.`
      : 'The callback route is active and ready for Auth0 redirects.';

  return <CallbackCard title={title} description={description} error={Boolean(error)} />;
}

function LiveAuthCallback() {
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading, getAccessTokenSilently, user } = useAuth0();
  const [state, setState] = useState({
    loading: true,
    error: false,
    title: 'Completing connection',
    description: 'Finishing the connected account flow with Auth0 Token Vault.',
  });

  useEffect(() => {
    let cancelled = false;

    async function finalize() {
      const service = searchParams.get('service');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');
      const connected = searchParams.get('connected') === 'true';

      if (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: true,
            title: 'Connection failed',
            description: errorDescription || error,
          });
        }
        return;
      }

      if (!connected) {
        if (!cancelled) {
          setState({
            loading: false,
            error: false,
            title: 'Authentication complete',
            description: searchParams.get('connected') === 'true'
              ? `Vouch can now request ${service || 'service'} actions without exposing the underlying OAuth credential to the agent.`
              : 'The callback route is active and ready for Auth0 redirects.',
          });
        }
        return;
      }

      if (isLoading) {
        return;
      }

      if (!isAuthenticated || !user?.sub) {
        if (!cancelled) {
          setState({
            loading: false,
            error: true,
            title: 'Sign-in required',
            description: 'Please sign in to Auth0 before completing a connected account flow.',
          });
        }
        return;
      }

      const connectedAccount = consumeConnectedAccountResult();
      const resolvedServiceId = connectedAccount?.serviceId || service;

      try {
        await recordConnectionState({
          serviceId: resolvedServiceId,
          connected: true,
          accountId: connectedAccount?.accountId || null,
          getAccessTokenSilently,
        });

        if (!cancelled) {
          setState({
            loading: false,
            error: false,
            title: `${resolvedServiceId || 'Service'} connected`,
            description: `The ${resolvedServiceId || 'service'} connected account is now linked to ${user.email || user.sub} and can be used for Vouch delegations.`,
          });
        }
      } catch (completionError) {
        if (!cancelled) {
          setState({
            loading: false,
            error: true,
            title: 'Connection failed',
            description: completionError.message,
          });
        }
      }
    }

    finalize();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, searchParams, user]);

  return <CallbackCard {...state} />;
}

export default function AuthCallback() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveAuthCallback /> : <BasicAuthCallback />;
}
