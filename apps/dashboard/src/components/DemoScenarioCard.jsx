import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Check, Copy, Play, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { saveLatestInvite } from '../lib/invite';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function DemoScenarioCardBody({ getAccessTokenSilently = null }) {
  const [state, setState] = useState({
    creating: false,
    error: '',
    result: null,
    copied: false,
  });

  async function runDemoScenario() {
    setState((current) => ({
      ...current,
      creating: true,
      error: '',
      copied: false,
    }));

    try {
      const response = await apiFetch('/api/delegate/demo-scenario', {
        method: 'POST',
        getAccessTokenSilently,
        body: {},
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create demo scenario');
      }

      saveLatestInvite(data);
      setState({
        creating: false,
        error: '',
        copied: false,
        result: data,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        creating: false,
        error: error.message,
      }));
    }
  }

  async function copyTask() {
    const task = state.result?.scenario?.suggestedTask;
    if (!task) {
      return;
    }

    await navigator.clipboard.writeText(task);
    setState((current) => ({
      ...current,
      copied: true,
    }));

    window.setTimeout(() => {
      setState((current) => ({
        ...current,
        copied: false,
      }));
    }, 1800);
  }

  const summary = state.result?.scenario?.policySummary;

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-vouch-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-vouch-purple/20 to-vouch-cyan/10 border border-vouch-border flex items-center justify-center">
          <Play className="w-4 h-4 text-vouch-purple-light" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-200">Run Demo Scenario</h2>
          <p className="text-[11px] text-gray-500">Seed a judge-friendly policy and fresh invite in one click</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-400">
          Generates a known-good delegation for <span className="text-white">cursor</span>: safe reads and branch work,
          human approval for PRs and pushes, and hard blocks on merges and secrets.
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300">Allow</p>
            <p className="text-xl font-semibold text-white mt-1">{summary?.allowCount ?? 7}</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-amber-300">Step-Up</p>
            <p className="text-xl font-semibold text-white mt-1">{summary?.stepUpCount ?? 3}</p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-red-300">Deny</p>
            <p className="text-xl font-semibold text-white mt-1">{summary?.denyCount ?? 5}</p>
          </div>
        </div>

        <button
          onClick={runDemoScenario}
          disabled={state.creating}
          className="btn-glow w-full text-sm !py-2.5 flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {state.creating ? 'Seeding demo scenario...' : 'Run Demo Scenario'}
        </button>

        {state.error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            {state.error}
          </div>
        )}

        {state.result && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-3">
            <p className="text-sm text-emerald-300 font-medium">Fresh policy and invite are ready.</p>
            <p className="text-xs text-gray-300">
              The Agent Invite card now has the new delegation package. For the CLI prompt, use:
            </p>
            <div className="relative">
              <div className="code-block text-xs whitespace-pre-wrap pr-10">
                {state.result.scenario?.suggestedTask || 'create a branch called feature/final-demo'}
              </div>
              <button
                onClick={copyTask}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              >
                {state.copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Delegation <span className="font-mono text-gray-300">{state.result.delegationId}</span> expires {state.result.expiresAt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveDemoScenarioCard() {
  const { getAccessTokenSilently } = useAuth0();
  return <DemoScenarioCardBody getAccessTokenSilently={getAccessTokenSilently} />;
}

export default function DemoScenarioCard() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveDemoScenarioCard /> : <DemoScenarioCardBody />;
}
