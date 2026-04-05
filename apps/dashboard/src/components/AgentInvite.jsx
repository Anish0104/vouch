import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { Copy, Check, Send, Bot, Link2, Shield } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { LATEST_INVITE_EVENT, loadLatestInvite, saveLatestInvite } from '../lib/invite';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function AgentInviteBody({
  delegationId,
  inviteToken,
  initialInvite = null,
  currentUserId = null,
  getAccessTokenSilently = null,
  liveMode = false,
}) {
  const [copied, setCopied] = useState(null);
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState(
    initialInvite || (delegationId ? { delegationId, inviteToken } : loadLatestInvite())
  );

  useEffect(() => {
    function syncInvite(event) {
      const nextInvite = event?.detail || loadLatestInvite();
      if (nextInvite) {
        setInvite(nextInvite);
      }
    }

    window.addEventListener(LATEST_INVITE_EVENT, syncInvite);
    return () => {
      window.removeEventListener(LATEST_INVITE_EVENT, syncInvite);
    };
  }, []);

  async function createInvite() {
    if (liveMode && !currentUserId) {
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch('/api/delegate', {
        method: 'POST',
        getAccessTokenSilently,
        body: {
          agentId: 'cursor-agent',
          policy: {
            allow: ['github.createBranch', 'github.readCode', 'github.listCommits', 'github.openPR', 'github.createCommit', 'github.pushCode'],
            deny: ['github.mergeToMain', 'github.deleteBranch', 'github.accessSecrets'],
            stepUpRequired: ['github.openPR', 'github.pushCode'],
            expiresIn: '48h',
          },
          services: ['github'],
          userId: currentUserId || undefined,
        },
      });
      const data = await res.json();
      saveLatestInvite(data);
      setInvite(data);
    } catch {}
    setCreating(false);
  }

  function copyToClipboard(value, label) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!invite) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-vouch-purple/20 to-vouch-cyan/10 flex items-center justify-center mx-auto mb-4 border border-vouch-border">
          <Bot className="w-7 h-7 text-vouch-purple-light" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Invite Agent</h3>
        <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
          Generate a secure invite package for an AI agent. The agent authenticates with Auth0 M2M and only gets the delegation metadata it needs.
        </p>
        <button onClick={createInvite} disabled={creating} className="btn-glow text-sm !py-2 !px-5">
          {creating ? 'Creating...' : 'Generate Invite'}
        </button>
      </motion.div>
    );
  }

  const resolvedApiUrl = getRuntimeConfig('VITE_API_URL') || 'http://localhost:3001';
  const envBlock = `# Add these to the agent's .env\nVOUCH_API_URL=${resolvedApiUrl}\nVOUCH_DELEGATION_ID=${invite.delegationId}\nVOUCH_INVITE_TOKEN=${invite.inviteToken}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-vouch-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vouch-purple/20 to-vouch-cyan/10 flex items-center justify-center border border-vouch-border">
          <Send className="w-4 h-4 text-vouch-cyan" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-200">Agent Invite</h3>
          <p className="text-[11px] text-gray-500">Share this invite package with the agent</p>
        </div>
        <button
          onClick={createInvite}
          disabled={creating}
          className="btn-outline text-xs !py-1.5 !px-3"
        >
          {creating ? 'Creating...' : 'Generate New'}
        </button>
      </div>

      <div className="p-5 space-y-3">
        {/* Delegation ID */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-vouch-border/50">
          <div>
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">Delegation ID</span>
            <p className="text-sm font-mono text-gray-200">{invite.delegationId}</p>
          </div>
          <button
            onClick={() => copyToClipboard(invite.delegationId, 'delegation')}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          >
            {copied === 'delegation' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Invite Token */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-vouch-border/50">
          <div>
            <span className="text-[10px] uppercase text-gray-500 tracking-wider">Invite Token</span>
            <p className="text-sm font-mono text-gray-200 break-all">{invite.inviteToken}</p>
          </div>
          <button
            onClick={() => copyToClipboard(invite.inviteToken, 'token')}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
          >
            {copied === 'token' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {invite.inviteUrl && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/30 border border-vouch-border/50">
            <div>
              <span className="text-[10px] uppercase text-gray-500 tracking-wider">Invite URL</span>
              <p className="text-sm font-mono text-gray-200 break-all">{invite.inviteUrl}</p>
            </div>
            <button
              onClick={() => copyToClipboard(invite.inviteUrl, 'url')}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
            >
              {copied === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {invite.expiresAt && (
          <div className="text-xs text-gray-500">
            Expires at <span className="font-mono text-gray-400">{invite.expiresAt}</span>
          </div>
        )}

        <div className="relative">
          <div className="code-block text-xs whitespace-pre">{envBlock}</div>
          <button
            onClick={() => copyToClipboard(envBlock, 'env')}
            className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-500 hover:text-white"
          >
            {copied === 'env' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
          <Shield className="w-3.5 h-3.5" />
          Agent authenticates via Auth0 M2M and still never holds your OAuth tokens
        </div>
      </div>
    </motion.div>
  );
}

function LiveAgentInvite(props) {
  const { user, getAccessTokenSilently } = useAuth0();

  return (
    <AgentInviteBody
      {...props}
      liveMode
      getAccessTokenSilently={getAccessTokenSilently}
      currentUserId={user?.sub || null}
    />
  );
}

export default function AgentInvite(props) {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveAgentInvite {...props} /> : <AgentInviteBody {...props} />;
}
