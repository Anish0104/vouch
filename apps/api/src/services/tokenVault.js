// services/tokenVault.js
// Fetches OAuth tokens from Auth0 Token Vault.
// In DEMO_MODE, returns a fake token so the rest of the stack works.

const jwt = require('jsonwebtoken');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
const { getManagementClient } = require('./auth0Management');
loadApiEnv();
const DEMO_MODE = isDemoMode();
const TOKEN_VAULT_GRANT_TYPE = 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token';
const TOKEN_VAULT_JWT_SUBJECT_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const TOKEN_VAULT_ACCESS_TOKEN_TYPE = 'http://auth0.com/oauth/token-type/token-vault-access-token';

function parseManagementPayload(result) {
  if (!result) return null;
  if (typeof result === 'object' && 'data' in result) {
    return result.data;
  }
  return result;
}

function normalizeAuth0Domain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function normalizePrivateKey(value) {
  return String(value || '')
    .trim()
    .replace(/\\n/g, '\n');
}

function getTokenVaultWorkerConfig() {
  return {
    domain: normalizeAuth0Domain(process.env.AUTH0_DOMAIN),
    clientId: String(process.env.AUTH0_TOKEN_VAULT_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.AUTH0_TOKEN_VAULT_CLIENT_SECRET || '').trim(),
    privateKey: normalizePrivateKey(process.env.AUTH0_TOKEN_VAULT_PRIVATE_KEY),
    keyId: String(process.env.AUTH0_TOKEN_VAULT_KEY_ID || '').trim(),
  };
}

async function getConnectedAccount(userId, service) {
  const mgmt = getManagementClient();
  const result = await mgmt.users.getConnectedAccounts({
    id: userId,
    take: 100,
  });
  const payload = parseManagementPayload(result);
  const connectedAccounts = Array.isArray(payload?.connected_accounts)
    ? payload.connected_accounts
    : Array.isArray(payload)
      ? payload
      : [];

  return connectedAccounts.find((account) => account?.connection === service) || null;
}

function createWorkerSubjectToken({ userId, clientId, domain, privateKey, keyId }) {
  return jwt.sign(
    {
      iss: clientId,
      aud: `https://${domain}/`,
      sub: userId,
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '5m',
      notBefore: 0,
      header: {
        typ: 'token-vault-req+jwt',
        ...(keyId ? { kid: keyId } : {}),
      },
    },
  );
}

async function exchangeTokenVaultAccessToken({ userId, service }) {
  const config = getTokenVaultWorkerConfig();
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'keyId' && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Token Vault worker configuration: ${missing.join(', ')}`);
  }

  const subjectToken = createWorkerSubjectToken({
    userId,
    clientId: config.clientId,
    domain: config.domain,
    privateKey: config.privateKey,
    keyId: config.keyId,
  });

  const response = await fetch(`https://${config.domain}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      subject_token: subjectToken,
      grant_type: TOKEN_VAULT_GRANT_TYPE,
      subject_token_type: TOKEN_VAULT_JWT_SUBJECT_TYPE,
      requested_token_type: TOKEN_VAULT_ACCESS_TOKEN_TYPE,
      connection: service,
    }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.error_description || payload?.message || payload?.error || `Auth0 token exchange failed with ${response.status}`;
    throw new Error(message);
  }

  if (!payload?.access_token) {
    throw new Error('Auth0 token exchange did not return access_token');
  }

  return payload.access_token;
}

/**
 * Fetch a stored OAuth token from Auth0 Token Vault.
 * The token is fetched and used immediately — never stored or logged.
 *
 * @param {string} userId  - Auth0 user ID (e.g. "auth0|abc123")
 * @param {string} service - Connection name (e.g. "github", "linear")
 * @returns {Promise<string>} access_token
 */
async function fetchToken(userId, service) {
  if (DEMO_MODE) {
    console.log(`[TokenVault][DEMO] Fetching simulated token for ${service} (user: ${userId})`);
    return `demo_token_${service}_${Date.now()}`;
  }

  try {
    const connectedAccount = await getConnectedAccount(userId, service);

    if (!connectedAccount) {
      throw new Error(`Auth0 user ${userId} does not have a connected account for ${service}.`);
    }

    return await exchangeTokenVaultAccessToken({ userId, service });
  } catch (err) {
    console.error(`[TokenVault] Failed to fetch token for ${service}:`, err.message);
    throw new Error(`Token Vault error: ${err.message}`);
  }
}

async function fetchIdentityProviderToken(userId, service) {
  if (DEMO_MODE) {
    return `demo_identity_token_${service}_${Date.now()}`;
  }

  try {
    const mgmt = getManagementClient();
    const result = await mgmt.users.get({
      id: userId,
      fields: 'user_id,email,identities',
      include_fields: true,
    });
    const payload = parseManagementPayload(result);
    const identities = Array.isArray(payload?.identities) ? payload.identities : [];
    const identity = identities.find((entry) => (
      entry
      && (entry.connection === service || entry.provider === service)
      && typeof entry.access_token === 'string'
      && entry.access_token
    ));

    if (!identity?.access_token) {
      throw new Error(`Auth0 user ${userId} does not have a ${service} identity access token available.`);
    }

    return identity.access_token;
  } catch (err) {
    throw new Error(`Identity token fallback error: ${err.message}`);
  }
}

/**
 * Fetch a token and immediately use it in an API call.
 * The token is never stored, logged, or returned to the caller.
 *
 * @param {string}   userId    - Auth0 user ID
 * @param {string}   service   - Service name ("github" | "linear")
 * @param {Function} apiCallFn - Async function that receives (token) and makes the API call
 */
async function callServiceWithVault(userId, service, apiCallFn) {
  const token = await fetchToken(userId, service);
  const result = await apiCallFn(token);
  // token is scoped here — never returned, never logged
  return result;
}

module.exports = {
  callServiceWithVault,
  fetchIdentityProviderToken,
  fetchToken,
  getConnectedAccount,
};
