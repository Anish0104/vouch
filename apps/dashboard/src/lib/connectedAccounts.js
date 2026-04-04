import { apiUrl } from './api';
import { getRuntimeConfig } from './runtimeConfig';

const FLOW_PREFIX = 'vouch:connected-account:';
const PENDING_SERVICE_KEY = 'vouch:pending-service-connect';
const CONNECTED_ACCOUNT_RESULT_KEY = 'vouch:connected-account-result';
const MY_ACCOUNT_SCOPE = [
  'create:me:connected_accounts',
  'read:me:connected_accounts',
  'delete:me:connected_accounts',
].join(' ');
export const CONNECTED_ACCOUNTS_LOGIN_SCOPE = [
  'openid',
  'profile',
  'email',
  'offline_access',
  MY_ACCOUNT_SCOPE,
].join(' ');

const DEFAULT_SERVICE_SCOPES = {
  github: [],
  linear: ['read', 'write', 'issues:create'],
};

function readStorage(key) {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(key);
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(key, value);
}

function removeStorage(key) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
}

function buildState() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `st_${window.crypto.randomUUID()}`;
  }

  return `st_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getAuth0Domain() {
  return String(getRuntimeConfig('VITE_AUTH0_DOMAIN') || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

export function getMyAccountAudience() {
  const domain = getAuth0Domain();
  return domain ? `https://${domain}/me/` : '';
}

export function buildMyAccountAuthorizationParams(extra = {}) {
  return {
    audience: getMyAccountAudience(),
    scope: CONNECTED_ACCOUNTS_LOGIN_SCOPE,
    ...extra,
  };
}

export function getConnectionName(serviceId) {
  const envKey = serviceId === 'github'
    ? 'VITE_AUTH0_GITHUB_CONNECTION'
    : serviceId === 'linear'
      ? 'VITE_AUTH0_LINEAR_CONNECTION'
      : '';

  return getRuntimeConfig(envKey) || serviceId;
}

function getServiceScopes(serviceId) {
  return DEFAULT_SERVICE_SCOPES[serviceId] || [];
}

async function getMyAccountToken(getAccessTokenSilently) {
  const audience = getMyAccountAudience();
  if (!audience) {
    throw new Error('Missing Auth0 domain for Connected Accounts');
  }

  return getAccessTokenSilently({
    authorizationParams: {
      audience,
      scope: MY_ACCOUNT_SCOPE,
    },
  });
}

async function callMyAccount(path, { method = 'GET', body, getAccessTokenSilently }) {
  const domain = getAuth0Domain();
  const accessToken = await getMyAccountToken(getAccessTokenSilently);
  const response = await fetch(`https://${domain}/me/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })() : null;

  if (!response.ok) {
    const message = payload?.error_description
      || payload?.message
      || payload?.error
      || `Connected Accounts request failed with ${response.status}`;

    if (response.status === 403 || response.status === 404) {
      throw new Error(`${message}. Check that Auth0 My Account API Connected Accounts is enabled and your SPA has the needed client grant.`);
    }

    throw new Error(message);
  }

  return payload;
}

function saveFlowState(state, value) {
  writeStorage(`${FLOW_PREFIX}${state}`, JSON.stringify(value));
}

function readFlowState(state) {
  const key = `${FLOW_PREFIX}${state}`;
  const raw = readStorage(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearFlowState(state) {
  removeStorage(`${FLOW_PREFIX}${state}`);
}

export function saveConnectedAccountResult(value) {
  writeStorage(CONNECTED_ACCOUNT_RESULT_KEY, JSON.stringify(value));
}

export function consumeConnectedAccountResult() {
  const raw = readStorage(CONNECTED_ACCOUNT_RESULT_KEY);
  removeStorage(CONNECTED_ACCOUNT_RESULT_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setPendingServiceConnect(serviceId) {
  writeStorage(PENDING_SERVICE_KEY, serviceId);
}

export function consumePendingServiceConnect() {
  const value = readStorage(PENDING_SERVICE_KEY);
  removeStorage(PENDING_SERVICE_KEY);
  return value;
}

export function requiresInteractiveConnectedAccountLogin(error) {
  const message = String(error?.message || error || '').toLowerCase();

  return [
    'missing refresh token',
    'consent required',
    'consent_required',
    'login required',
    'login_required',
    'interaction required',
    'interaction_required',
  ].some((pattern) => message.includes(pattern));
}

export async function startConnectedAccountRequest({ serviceId, getAccessTokenSilently }) {
  const redirectUri = `${window.location.origin}/callback`;
  const state = buildState();
  const payload = await callMyAccount('/connected-accounts/connect', {
    method: 'POST',
    getAccessTokenSilently,
    body: {
      connection: getConnectionName(serviceId),
      redirect_uri: redirectUri,
      state,
      scopes: getServiceScopes(serviceId),
    },
  });

  saveFlowState(state, {
    serviceId,
    redirectUri,
    authSession: payload?.auth_session,
  });

  if (!payload?.connect_uri) {
    throw new Error('Connected Accounts flow did not return a connect URI');
  }

  window.location.assign(payload.connect_uri);
}

export async function completeConnectedAccountRequest({ connectCode, state, getAccessTokenSilently }) {
  const flowState = readFlowState(state);

  if (!flowState?.authSession || !flowState?.serviceId || !flowState?.redirectUri) {
    throw new Error('Missing or expired connection session. Please start the connection again.');
  }

  await callMyAccount('/connected-accounts/complete', {
    method: 'POST',
    getAccessTokenSilently,
    body: {
      auth_session: flowState.authSession,
      connect_code: connectCode,
      redirect_uri: flowState.redirectUri,
    },
  });

  clearFlowState(state);

  return {
    serviceId: flowState.serviceId,
  };
}

export async function recordConnectionState({ serviceId, connected, userId, accountId = null }) {
  const response = await fetch(apiUrl(`/api/auth/record/${serviceId}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connected,
      userId,
      accountId,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to store connection status');
  }

  return data;
}
