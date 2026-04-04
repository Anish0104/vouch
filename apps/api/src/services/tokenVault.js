// services/tokenVault.js
// Fetches OAuth tokens from Auth0 Token Vault.
// In DEMO_MODE, returns a fake token so the rest of the stack works.

const { isDemoMode, loadApiEnv } = require('../config/runtime');
const { getManagementClient } = require('./auth0Management');
loadApiEnv();
const DEMO_MODE = isDemoMode();

function parseManagementPayload(result) {
  if (!result) return null;
  if (typeof result === 'object' && 'data' in result) {
    return result.data;
  }
  return result;
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
    const mgmt = getManagementClient();
    // Auth0 Token Vault API for AI Agents addon
    const result = await mgmt.users.getTokenVaultConnection({
      id: userId,
      connectionName: service,
    });
    return result.access_token;
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
};
