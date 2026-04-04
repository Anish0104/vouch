import React from 'react';
import { Auth0Provider } from '@auth0/auth0-react';
import {
  buildMyAccountAuthorizationParams,
  saveConnectedAccountResult,
} from '../lib/connectedAccounts';
import { getRuntimeConfig } from '../lib/runtimeConfig';

function handleRedirectCallback(appState) {
  const responseType = appState?.response_type;
  const connectedAccount = appState?.connectedAccount;
  const returnTo = typeof appState?.returnTo === 'string' && appState.returnTo
    ? appState.returnTo
    : window.location.pathname;

  if (responseType === 'connect_code' && connectedAccount) {
    saveConnectedAccountResult({
      serviceId: appState?.serviceId || connectedAccount.connection || null,
      accountId: connectedAccount.id || null,
      connection: connectedAccount.connection || null,
      createdAt: connectedAccount.created_at || null,
      scopes: Array.isArray(connectedAccount.scopes) ? connectedAccount.scopes : [],
    });
  }

  window.history.replaceState({}, document.title, returnTo);
}

export default function Auth0ProviderWrapper({ children }) {
  const domain = getRuntimeConfig('VITE_AUTH0_DOMAIN') || 'vouch-dev.us.auth0.com';
  const clientId = getRuntimeConfig('VITE_AUTH0_CLIENT_ID');
  const isDemo = !clientId;

  if (isDemo) {
    // In demo mode, render children without Auth0
    return <>{children}</>;
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/callback`,
        ...buildMyAccountAuthorizationParams(),
      }}
      onRedirectCallback={handleRedirectCallback}
      cacheLocation="localstorage"
      useRefreshTokens
      useRefreshTokensFallback
    >
      {children}
    </Auth0Provider>
  );
}
