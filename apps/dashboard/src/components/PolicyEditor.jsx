import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { CheckCircle, XOctagon, AlertTriangle, Save, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { saveLatestInvite } from '../lib/invite';
import { getRuntimeConfig } from '../lib/runtimeConfig';

const defaultPolicy = {
  agent: 'cursor',
  expires: '48h',
  allow: [
    'github.createBranch',
    'github.readCode',
    'github.openPR',
    'github.listCommits',
    'github.listBranches',
    'github.createCommit',
    'github.pushCode',
    'linear.createIssue',
    'linear.listTeams',
    'linear.listIssues',
  ],
  deny: [
    'github.mergeToMain',
    'github.deleteBranch',
    'github.modifyWorkflows',
    'github.accessSecrets',
  ],
  stepUpRequired: ['github.openPR', 'github.pushCode', 'linear.createIssue'],
};

const allActions = [
  { id: 'github.createBranch', label: 'Create Branch', service: 'github' },
  { id: 'github.readCode', label: 'Read Code', service: 'github' },
  { id: 'github.openPR', label: 'Open PR', service: 'github' },
  { id: 'github.listCommits', label: 'List Commits', service: 'github' },
  { id: 'github.listBranches', label: 'List Branches', service: 'github' },
  { id: 'github.listPRs', label: 'List PRs', service: 'github' },
  { id: 'github.getFileContents', label: 'Get File Contents', service: 'github' },
  { id: 'github.pushCode', label: 'Push Code', service: 'github' },
  { id: 'github.createCommit', label: 'Create Commit', service: 'github' },
  { id: 'github.mergeToMain', label: 'Merge to Main', service: 'github' },
  { id: 'github.deleteBranch', label: 'Delete Branch', service: 'github' },
  { id: 'github.modifyWorkflows', label: 'Modify Workflows', service: 'github' },
  { id: 'github.accessSecrets', label: 'Access Secrets', service: 'github' },
  { id: 'github.deleteRepo', label: 'Delete Repo', service: 'github' },
  { id: 'linear.createIssue', label: 'Create Issue', service: 'linear' },
  { id: 'linear.listTeams', label: 'List Teams', service: 'linear' },
  { id: 'linear.listIssues', label: 'List Issues', service: 'linear' },
  { id: 'linear.updateIssue', label: 'Update Issue', service: 'linear' },
  { id: 'linear.deleteProject', label: 'Delete Project', service: 'linear' },
];

function deriveServicesFromPolicy(policy) {
  return [...new Set(
    [
      ...(Array.isArray(policy.allow) ? policy.allow : []),
      ...(Array.isArray(policy.deny) ? policy.deny : []),
      ...(Array.isArray(policy.stepUpRequired) ? policy.stepUpRequired : []),
    ]
      .map((action) => String(action || '').split('.')[0])
      .filter(Boolean),
  )];
}

function PolicyEditorBody({ onSave, currentUserId = null, getAccessTokenSilently = null, liveMode = false }) {
  const [policy, setPolicy] = useState(defaultPolicy);
  const [view, setView] = useState('visual'); // 'visual' | 'yaml'
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [savedDelegation, setSavedDelegation] = useState(null);

  function getActionState(actionId) {
    if (policy.deny.includes(actionId)) return 'deny';
    if (policy.allow.includes(actionId)) {
      if (policy.stepUpRequired.includes(actionId)) return 'stepup';
      return 'allow';
    }
    return 'unset';
  }

  function cycleAction(actionId) {
    const current = getActionState(actionId);
    const newPolicy = { ...policy };
    // Remove from all lists first
    newPolicy.allow = newPolicy.allow.filter((a) => a !== actionId);
    newPolicy.deny = newPolicy.deny.filter((a) => a !== actionId);
    newPolicy.stepUpRequired = newPolicy.stepUpRequired.filter((a) => a !== actionId);

    // Cycle: unset -> allow -> stepup -> deny -> unset
    if (current === 'unset') {
      newPolicy.allow = [...newPolicy.allow, actionId];
    } else if (current === 'allow') {
      newPolicy.allow = [...newPolicy.allow, actionId];
      newPolicy.stepUpRequired = [...newPolicy.stepUpRequired, actionId];
    } else if (current === 'stepup') {
      newPolicy.deny = [...newPolicy.deny, actionId];
    }
    // if current === 'deny', cycle back to unset (already removed)

    setPolicy(newPolicy);
    setSaveState('idle');
  }

  function toYaml() {
    let y = `# .vouch.yml — Agent Delegation Policy\n\n`;
    y += `agent: ${policy.agent}\n`;
    y += `expires: ${policy.expires}\n\n`;
    y += `allow:\n`;
    policy.allow.forEach((a) => (y += `  - ${a}\n`));
    y += `\ndeny:\n`;
    policy.deny.forEach((a) => (y += `  - ${a}\n`));
    y += `\nstep_up_required:\n`;
    policy.stepUpRequired.forEach((a) => (y += `  - ${a}\n`));
    return y;
  }

  async function handleSave() {
    if (liveMode && !currentUserId) {
      setSaveState('error');
      setSaveError('Sign in with Auth0 before creating a live delegation.');
      return;
    }

    setSaveState('saving');
    setSaveError('');

    try {
      const response = await apiFetch('/api/delegate', {
        method: 'POST',
        getAccessTokenSilently,
        body: {
          agentId: policy.agent,
          policy: {
            agent: policy.agent,
            allow: policy.allow,
            deny: policy.deny,
            stepUpRequired: policy.stepUpRequired,
            expiresIn: policy.expires,
          },
          services: deriveServicesFromPolicy(policy),
          userId: currentUserId || undefined,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save policy');
      }

      saveLatestInvite(data);
      setSavedDelegation(data);
      setSaveState('saved');

      if (onSave) {
        onSave({ policy, delegation: data });
      }
    } catch (error) {
      setSaveState('error');
      setSaveError(error.message);
    }
  }

  const stateStyles = {
    allow: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle },
    stepup: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle },
    deny: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', icon: XOctagon },
    unset: { bg: 'bg-white/[0.02] border-white/5', text: 'text-gray-500', icon: null },
  };

  const services = ['github', 'linear'];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('visual')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
              view === 'visual' ? 'bg-vouch-purple/20 text-vouch-purple-light' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setView('yaml')}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
              view === 'yaml' ? 'bg-vouch-purple/20 text-vouch-purple-light' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            YAML
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPolicy(defaultPolicy);
              setSaveState('idle');
              setSaveError('');
            }}
            className="btn-outline text-xs flex items-center gap-1.5 !py-1.5 !px-3"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button onClick={handleSave} className="btn-glow text-xs flex items-center gap-1.5 !py-1.5 !px-3">
            <Save className="w-3.5 h-3.5" />
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save Policy'}
          </button>
        </div>
      </div>

      {(saveError || savedDelegation) && (
        <div className={`glass-card p-4 text-sm ${saveError ? 'border border-red-500/20' : 'border border-emerald-500/20'}`}>
          {saveError ? (
            <p className="text-red-400">{saveError}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-emerald-400 font-medium">Delegation created and ready to share with the agent.</p>
              <p className="text-gray-400 text-xs font-mono">
                {savedDelegation?.delegationId} · expires {savedDelegation?.expiresAt}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Top Controls */}
      <div className="glass-card p-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Agent:</label>
          <input
            value={policy.agent}
            onChange={(e) => {
              setPolicy({ ...policy, agent: e.target.value });
              setSaveState('idle');
              setSaveError('');
            }}
            className="text-sm bg-white/5 border border-vouch-border rounded-lg px-3 py-1.5 text-gray-200 w-32 focus:outline-none focus:border-vouch-purple/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Expires:</label>
          <select
            value={policy.expires}
            onChange={(e) => {
              setPolicy({ ...policy, expires: e.target.value });
              setSaveState('idle');
              setSaveError('');
            }}
            className="text-sm bg-white/5 border border-vouch-border rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-vouch-purple/50"
          >
            <option value="1h">1 hour</option>
            <option value="12h">12 hours</option>
            <option value="24h">24 hours</option>
            <option value="48h">48 hours</option>
            <option value="7d">7 days</option>
          </select>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 ml-auto text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400"/> Allow</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/> Step-up</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"/> Deny</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600"/> Unset</span>
        </div>
      </div>

      {view === 'visual' ? (
        /* Visual Editor */
        <div className="space-y-6">
          {services.map((service) => (
            <div key={service}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-[10px]">
                  {service === 'github' ? '🐙' : '📐'}
                </span>
                {service}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {allActions
                  .filter((a) => a.service === service)
                  .map((action) => {
                    const state = getActionState(action.id);
                    const style = stateStyles[state];
                    const Icon = style.icon;
                    return (
                      <motion.button
                        key={action.id}
                        onClick={() => cycleAction(action.id)}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${style.bg} ${style.text}`}
                      >
                        {Icon ? <Icon className="w-4 h-4 flex-shrink-0" /> : <div className="w-4 h-4" />}
                        <span className="text-xs font-mono truncate">{action.id}</span>
                        <span className="text-[10px] ml-auto uppercase opacity-60">{state}</span>
                      </motion.button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* YAML View */
        <div className="code-block whitespace-pre text-sm">{toYaml()}</div>
      )}
    </div>
  );
}

function LivePolicyEditor(props) {
  const { user, getAccessTokenSilently } = useAuth0();

  return (
    <PolicyEditorBody
      {...props}
      liveMode
      getAccessTokenSilently={getAccessTokenSilently}
      currentUserId={user?.sub || null}
    />
  );
}

export default function PolicyEditor(props) {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LivePolicyEditor {...props} /> : <PolicyEditorBody {...props} />;
}
