import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, CheckCircle2, Clock3, ExternalLink, ShieldAlert } from 'lucide-react';
import AgentInvite from '../components/AgentInvite';
import { apiUrl } from '../lib/api';
import { saveLatestInvite } from '../lib/invite';

export default function Invite() {
  const { token } = useParams();
  const [state, setState] = useState({
    loading: true,
    invite: null,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      try {
        const response = await fetch(apiUrl(`/api/delegate/invite/${encodeURIComponent(token)}`));
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Invite not found');
        }

        const invite = {
          delegationId: data.delegationId,
          inviteToken: token,
          inviteUrl: window.location.href,
          expiresAt: data.expiresAt,
          services: data.services || [],
          policy: data.policy || null,
        };

        saveLatestInvite(invite);

        if (!cancelled) {
          setState({
            loading: false,
            invite,
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            invite: null,
            error: error.message,
          });
        }
      }
    }

    loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.loading) {
    return (
      <div className="glass-card p-8 text-center">
        <Bot className="w-8 h-8 text-vouch-cyan mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white">Resolving invite</h1>
        <p className="text-sm text-gray-500 mt-2">Fetching delegation details and saving them for the agent setup flow.</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="glass-card p-8 text-center">
        <ShieldAlert className="w-8 h-8 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-white">Invite unavailable</h1>
        <p className="text-sm text-red-300 mt-2">{state.error}</p>
        <Link to="/" className="inline-flex mt-5 btn-outline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { invite } = state;
  const allowCount = invite.policy?.allow?.length || 0;
  const stepUpCount = invite.policy?.stepUpRequired?.length || 0;

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8"
      >
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Invite Ready</span>
        </div>
        <h1 className="text-2xl font-bold text-white">This delegation has been resolved and saved locally.</h1>
        <p className="text-sm text-gray-400 mt-2 max-w-2xl">
          The invite token now maps to a specific delegation policy. You can hand the environment block below to the
          agent, or return to the dashboard and continue the live demo flow.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="rounded-2xl border border-vouch-border bg-black/20 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Services</p>
            <p className="text-sm text-white mt-1">{invite.services?.join(', ') || 'None'}</p>
          </div>
          <div className="rounded-2xl border border-vouch-border bg-black/20 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Allowed Actions</p>
            <p className="text-sm text-white mt-1">{allowCount}</p>
          </div>
          <div className="rounded-2xl border border-vouch-border bg-black/20 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Step-Up Actions</p>
            <p className="text-sm text-white mt-1">{stepUpCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" />
            Expires {invite.expiresAt}
          </span>
          <Link to="/" className="inline-flex items-center gap-1.5 text-vouch-cyan hover:text-vouch-purple-light transition-colors">
            Open dashboard <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.div>

      <AgentInvite initialInvite={invite} />
    </div>
  );
}
