import React from 'react';
import { motion } from 'framer-motion';
import { Link2, Shield, Lock, ArrowRight } from 'lucide-react';
import AuthPreflightPanel from '../components/AuthPreflightPanel';
import ServicePanel from '../components/ServicePanel';

export default function Connect() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-5 h-5 text-vouch-cyan" />
          <span className="text-xs font-semibold text-vouch-cyan uppercase tracking-wider">Connect Services</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Connect your tools via <span className="gradient-text">Auth0 Token Vault</span>
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl">
          OAuth tokens are stored exclusively in Auth0 Token Vault. Your AI agents never see, hold,  
          or transmit your credentials. The Vouch API calls Token Vault at execution time, uses the token,
          and discards it immediately.
        </p>
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-vouch-purple-light" />
          How Token Vault Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: '01', title: 'Connect', desc: 'Click connect below and sign in via OAuth' },
            { step: '02', title: 'Store', desc: 'Token stored in Auth0 Token Vault (encrypted)' },
            { step: '03', title: 'Execute', desc: 'Agent requests action → Vouch calls Token Vault' },
            { step: '04', title: 'Discard', desc: 'Token used once, discarded. Never logged.' },
          ].map((item, i) => (
            <div key={i} className="relative flex items-start gap-3 p-3">
              <span className="text-2xl font-bold text-vouch-purple/20 font-mono leading-none">{item.step}</span>
              <div>
                <p className="text-sm font-semibold text-gray-200">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
              {i < 3 && (
                <ArrowRight className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
      >
        <AuthPreflightPanel />
      </motion.div>

      {/* Services */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <ServicePanel />
      </motion.div>

      {/* Security note */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5 flex items-start gap-4 border-vouch-purple/10"
      >
        <Shield className="w-5 h-5 text-vouch-purple-light flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-gray-200 mb-1">Zero-credential agent architecture</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Vouch's core security guarantee: the AI agent authenticates via Auth0 Machine-to-Machine tokens
            scoped to the Vouch API only. When an agent action is approved, the Vouch backend calls Token Vault 
            to fetch the OAuth token, executes the API call, and discards the token. The agent never sees, 
            receives, or stores any user credential at any point.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
