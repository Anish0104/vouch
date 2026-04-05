const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { generateKeyPairSync } = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

function clearApiModuleCache() {
  const apiRoot = path.join(REPO_ROOT, 'apps/api/src');

  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(apiRoot)) {
      delete require.cache[modulePath];
    }
  }
}

function primeTokenVaultEnv() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  process.env.AUTH0_DOMAIN = 'tenant.example.auth0.com';
  process.env.AUTH0_TOKEN_VAULT_CLIENT_ID = 'worker_client_123';
  process.env.AUTH0_TOKEN_VAULT_CLIENT_SECRET = 'worker_secret_123';
  process.env.AUTH0_TOKEN_VAULT_PRIVATE_KEY = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

test('fetchToken exchanges a privileged worker JWT for a connected account access token', async (t) => {
  primeTokenVaultEnv();
  clearApiModuleCache();

  const management = require(path.join(REPO_ROOT, 'apps/api/src/services/auth0Management.js'));
  management.setManagementClientFactoryForTests(() => ({
    users: {
      async getConnectedAccounts() {
        return {
          data: {
            connected_accounts: [
              { id: 'cac_123', connection: 'linear' },
            ],
          },
        };
      },
    },
  }));

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ access_token: 'vault-token-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
    management.resetManagementClientForTests();
    clearApiModuleCache();
  });

  const { fetchToken } = require(path.join(REPO_ROOT, 'apps/api/src/services/tokenVault.js'));
  const token = await fetchToken('auth0|user_123', 'linear');

  assert.equal(token, 'vault-token-123');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://tenant.example.auth0.com/oauth/token');

  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.client_id, 'worker_client_123');
  assert.equal(payload.connection, 'linear');
  assert.equal(
    payload.grant_type,
    'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
  );
  assert.equal(payload.subject_token_type, 'urn:ietf:params:oauth:token-type:jwt');
  assert.equal(payload.requested_token_type, 'http://auth0.com/oauth/token-type/token-vault-access-token');
  assert.match(payload.subject_token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
});

test('fetchToken fails clearly when the user has not linked the requested connected account', async (t) => {
  primeTokenVaultEnv();
  clearApiModuleCache();

  const management = require(path.join(REPO_ROOT, 'apps/api/src/services/auth0Management.js'));
  management.setManagementClientFactoryForTests(() => ({
    users: {
      async getConnectedAccounts() {
        return {
          data: {
            connected_accounts: [],
          },
        };
      },
    },
  }));

  const originalFetch = global.fetch;
  let calledFetch = false;
  global.fetch = async () => {
    calledFetch = true;
    throw new Error('fetch should not be called when no connected account exists');
  };

  t.after(() => {
    global.fetch = originalFetch;
    management.resetManagementClientForTests();
    clearApiModuleCache();
  });

  const { fetchToken } = require(path.join(REPO_ROOT, 'apps/api/src/services/tokenVault.js'));

  await assert.rejects(
    fetchToken('auth0|user_123', 'github'),
    /Token Vault error: Auth0 user auth0\|user_123 does not have a connected account for github\./,
  );

  assert.equal(calledFetch, false);
});
