import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import Auth0ProviderWrapper from './auth/auth0-provider';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import Policy from './pages/Policy';
import Invite from './pages/Invite';
import AuthCallback from './pages/AuthCallback';
import { apiUrl } from './lib/api';
import { getRuntimeConfig } from './lib/runtimeConfig';

function Shell({ user }) {
  const [environmentMode, setEnvironmentMode] = useState('unknown');

  useEffect(() => {
    let cancelled = false;

    async function loadMode() {
      try {
        const response = await fetch(apiUrl('/health'));
        const data = await response.json();
        if (!cancelled) {
          setEnvironmentMode(data.demo ? 'demo' : 'live');
        }
      } catch {
        if (!cancelled) {
          setEnvironmentMode('offline');
        }
      }
    }

    loadMode();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen relative">
        <div className="ambient-bg" />

        <div className="relative z-10">
          <Navbar user={user} environmentMode={environmentMode} />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/policy" element={<Policy />} />
              <Route path="/invite/:token" element={<Invite />} />
              <Route path="/callback" element={<AuthCallback />} />
              <Route path="/approve/:auditId" element={<Dashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

function DemoAppShell() {
  return (
    <Shell
      user={{
        name: 'Anish',
        email: 'anish@vouch.dev',
        picture: null,
      }}
    />
  );
}

function LiveAppShell() {
  const { user } = useAuth0();

  return (
    <Shell
      user={{
        name: user?.name || user?.nickname || user?.email || 'Vouch User',
        email: user?.email || user?.sub || '',
        picture: user?.picture || null,
      }}
    />
  );
}

export default function App() {
  const authClientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');

  return (
    <Auth0ProviderWrapper>
      {authClientId ? <LiveAppShell /> : <DemoAppShell />}
    </Auth0ProviderWrapper>
  );
}
