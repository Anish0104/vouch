import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth0 } from '@auth0/auth0-react';
import { ShieldCheck, ShieldX, X, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function StepUpModalBody({ getAccessTokenSilently = null }) {
  const navigate = useNavigate();
  const { auditId: routeAuditId } = useParams();
  const [pending, setPending] = useState([]);
  const [activeAction, setActiveAction] = useState(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 3000);
    return () => clearInterval(interval);
  }, [routeAuditId]);

  function fetchPending() {
    apiFetch('/api/audit/pending', { getAccessTokenSilently })
      .then((r) => r.json())
      .then((data) => {
        const items = data.pending || [];
        setPending(items);
        setActiveAction((current) => {
          if (!items.length) return null;
          if (routeAuditId) {
            return items.find((item) => item.auditId === routeAuditId) || null;
          }
          if (!current) return items[0];
          return items.find((item) => item.auditId === current.auditId) || items[0];
        });
      })
      .catch(() => {});
  }

  function closeModal() {
    setActiveAction(null);
    if (routeAuditId) {
      navigate('/', { replace: true });
    }
  }

  async function handleApprove(auditId) {
    setProcessing(true);
    try {
      await apiFetch(`/api/audit/approve/${auditId}`, {
        method: 'POST',
        getAccessTokenSilently,
      });
      fetchPending();
      closeModal();
    } catch {}
    setProcessing(false);
  }

  async function handleReject(auditId) {
    setProcessing(true);
    try {
      await apiFetch(`/api/audit/reject/${auditId}`, {
        method: 'POST',
        getAccessTokenSilently,
      });
      fetchPending();
      closeModal();
    } catch {}
    setProcessing(false);
  }

  if (!activeAction) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={closeModal}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-card max-w-md w-full overflow-hidden border border-amber-500/20"
        >
          {/* Header */}
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-200">Step-up Approval</h3>
                <p className="text-xs text-amber-400/60">Human confirmation required</p>
              </div>
            </div>
            <button onClick={closeModal} className="text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            {/* Agent */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Agent</span>
              <span className="font-mono text-gray-200">{activeAction.agentId}</span>
            </div>
            {/* Action */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Action</span>
              <span className="font-mono text-amber-300">{activeAction.service}.{activeAction.action}</span>
            </div>
            {/* Params */}
            {activeAction.params && (
              <div className="text-sm">
                <span className="text-gray-500 block mb-1.5">Parameters</span>
                <div className="code-block text-xs">
                  {JSON.stringify(activeAction.params, null, 2)}
                </div>
              </div>
            )}
            {/* Delegation */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Delegation</span>
              <span className="font-mono text-gray-400 text-xs">{activeAction.delegationId}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 border-t border-vouch-border flex items-center gap-3">
            <button
              onClick={() => handleReject(activeAction.auditId)}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-all"
            >
              <ShieldX className="w-4 h-4" />
              Reject
            </button>
            <button
              onClick={() => handleApprove(activeAction.auditId)}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold hover:shadow-lg hover:shadow-emerald-500/20 transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              Approve
            </button>
          </div>

          {/* Remaining */}
          {pending.length > 1 && (
            <div className="px-6 py-2 border-t border-vouch-border text-center text-xs text-gray-500">
              +{pending.length - 1} more pending approval{pending.length - 1 > 1 ? 's' : ''}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function LiveStepUpModal() {
  const { getAccessTokenSilently } = useAuth0();
  return <StepUpModalBody getAccessTokenSilently={getAccessTokenSilently} />;
}

export default function StepUpModal() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  return authClientId ? <LiveStepUpModal /> : <StepUpModalBody />;
}
