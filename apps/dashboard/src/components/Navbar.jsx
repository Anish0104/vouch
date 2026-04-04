import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Activity, Link2, FileCode, Menu, X } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: Activity },
  { path: '/connect', label: 'Connect', icon: Link2 },
  { path: '/policy', label: 'Policy', icon: FileCode },
];

export default function Navbar({ user, environmentMode = 'unknown' }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const modeBadge = environmentMode === 'demo'
    ? { label: 'DEMO', className: 'bg-vouch-purple/15 text-vouch-purple-light border-vouch-purple/20' }
    : environmentMode === 'live'
      ? { label: 'LIVE', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' }
      : environmentMode === 'offline'
        ? { label: 'API OFFLINE', className: 'bg-amber-500/15 text-amber-200 border-amber-500/20' }
        : { label: 'CHECKING', className: 'bg-white/10 text-gray-300 border-white/10' };

  return (
    <nav className="sticky top-0 z-50 border-b border-vouch-border bg-vouch-bg/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-vouch-purple to-vouch-cyan flex items-center justify-center shadow-lg shadow-vouch-purple/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-vouch-purple to-vouch-cyan opacity-0 group-hover:opacity-40 blur-lg transition-opacity duration-500" />
            </div>
            <span className="text-xl font-bold gradient-text tracking-tight">Vouch</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-lg bg-white/10 border border-white/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* User + Demo Badge */}
          <div className="hidden md:flex items-center gap-4">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${modeBadge.className}`}>
              {modeBadge.label}
            </span>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vouch-purple to-vouch-cyan flex items-center justify-center text-sm font-semibold text-white">
                {user?.name?.charAt(0) || 'V'}
              </div>
              <div className="text-sm">
                <p className="font-medium text-gray-200">{user?.name}</p>
                <p className="text-gray-500 text-xs">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="md:hidden border-t border-vouch-border bg-vouch-bg/95 backdrop-blur-xl p-4"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'text-white bg-white/10' : 'text-gray-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </motion.div>
      )}
    </nav>
  );
}
