import React from 'react';
import { motion } from 'framer-motion';
import { FileCode, Shield, Info } from 'lucide-react';
import PolicyEditor from '../components/PolicyEditor';

export default function Policy() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <FileCode className="w-5 h-5 text-vouch-emerald" />
          <span className="text-xs font-semibold text-vouch-emerald uppercase tracking-wider">Policy as Code</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Define what your agent <span className="gradient-text">can and cannot do</span>
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl">
          Your <code className="text-vouch-purple-light bg-vouch-purple/10 px-1.5 py-0.5 rounded text-xs font-mono">.vouch.yml</code> policy
          is a machine-readable trust contract. The agent reads this before attempting any action and self-regulates.
          Actions are then enforced again at the Token Vault layer — defense in depth.
        </p>
      </motion.div>

      {/* Info block */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-5 flex items-start gap-4"
      >
        <Info className="w-5 h-5 text-vouch-cyan flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-200 mb-1">How policy enforcement works</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-400">Click to cycle</strong> each action through four states: 
            <span className="text-emerald-400"> Allow</span> →
            <span className="text-amber-400"> Step-up</span> →
            <span className="text-red-400"> Deny</span> →
            <span className="text-gray-400"> Unset</span>.
            Step-up actions require you to approve them in real-time from the dashboard before they execute.
            Denied actions are immediately blocked and logged.
          </p>
        </div>
      </motion.div>

      {/* Editor */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <PolicyEditor />
      </motion.div>

      {/* Architecture note */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5 flex items-start gap-4 border-vouch-emerald/10"
      >
        <Shield className="w-5 h-5 text-vouch-emerald flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-200 mb-1">Defense in depth</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Policies are enforced at two layers: (1) the agent reads <code className="text-vouch-purple-light bg-vouch-purple/10 px-1 rounded font-mono">.vouch.yml</code> and self-regulates before making 
            any request, and (2) the Vouch API checks the policy server-side before calling Token Vault.
            Even a malicious agent that ignores the policy file would be blocked at the API layer.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
