const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function clearApiModuleCache() {
  const apiRoot = path.join(REPO_ROOT, 'apps/api/src');

  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(apiRoot)) {
      delete require.cache[modulePath];
    }
  }
}

async function startApi({
  dataDir,
  demoMode,
  nodeEnv = 'test',
  frontendUrl = 'http://localhost:5173',
  apiBaseUrl = '',
  auth0Domain = 'example.auth0.com',
  auth0ClientId = 'client_123',
  auth0Audience = 'https://api.vouch.dev',
  auth0MgmtClientId = 'mgmt_client_123',
  auth0MgmtClientSecret = 'mgmt_secret_123',
  auth0TokenVaultClientId = 'worker_client_123',
  auth0TokenVaultClientSecret = 'worker_secret_123',
  auth0TokenVaultPrivateKey = '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----',
  viteAuth0GithubConnection = 'github',
  viteAuth0LinearConnection = 'linear',
  configureModules = null,
}) {
  process.env.VOUCH_DATA_DIR = dataDir;
  process.env.DEMO_MODE = demoMode ? 'true' : 'false';
  process.env.NODE_ENV = nodeEnv;
  process.env.FRONTEND_URL = frontendUrl;
  process.env.API_BASE_URL = apiBaseUrl;
  process.env.AUTH0_DOMAIN = auth0Domain;
  process.env.AUTH0_CLIENT_ID = auth0ClientId;
  process.env.AUTH0_AUDIENCE = auth0Audience;
  process.env.AUTH0_MGMT_CLIENT_ID = auth0MgmtClientId;
  process.env.AUTH0_MGMT_CLIENT_SECRET = auth0MgmtClientSecret;
  process.env.AUTH0_TOKEN_VAULT_CLIENT_ID = auth0TokenVaultClientId;
  process.env.AUTH0_TOKEN_VAULT_CLIENT_SECRET = auth0TokenVaultClientSecret;
  process.env.AUTH0_TOKEN_VAULT_PRIVATE_KEY = auth0TokenVaultPrivateKey;
  process.env.VITE_AUTH0_GITHUB_CONNECTION = viteAuth0GithubConnection;
  process.env.VITE_AUTH0_LINEAR_CONNECTION = viteAuth0LinearConnection;

  clearApiModuleCache();
  if (configureModules) {
    configureModules();
  }

  const { createApp } = require(path.join(REPO_ROOT, 'apps/api/src/index.js'));
  const app = createApp();

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return { server, baseUrl };
}

async function stopApi(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function postJson(baseUrl, pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

function liveUserHeaders(userId = 'auth0|user_123') {
  return {
    Authorization: `Bearer test-user:${userId}`,
  };
}

test('demo flow persists delegations and approvals across restarts', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-demo-api-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({ dataDir, demoMode: true }));

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  assert.equal(health.demo, true);

  const delegationResponse = await postJson(baseUrl, '/api/delegate', {
    agentId: 'cursor-agent',
    policy: {
      allow: ['github.createBranch', 'github.createCommit', 'github.openPR'],
      deny: ['github.deleteBranch'],
      stepUpRequired: ['github.openPR'],
      expiresIn: '24h',
    },
  });

  assert.equal(delegationResponse.status, 201);
  assert.match(delegationResponse.body.inviteUrl, /\/invite\/vch_/);

  const inviteResponse = await fetch(`${baseUrl}/api/delegate/invite/${delegationResponse.body.inviteToken}`).then((response) => response.json());
  assert.equal(inviteResponse.delegationId, delegationResponse.body.delegationId);
  assert.deepEqual(inviteResponse.policy.allow, ['github.createBranch', 'github.createCommit', 'github.openPR']);

  const createCommitResponse = await postJson(
    baseUrl,
    '/api/agent/action',
    {
      service: 'github',
      action: 'createCommit',
      params: {
        repo: 'demo/repo',
        branch: 'feature/test',
        message: 'Add a test commit',
        files: [{ path: 'README.md', content: '# Test' }],
      },
    },
    {
      Authorization: 'Bearer vch_demo_agent_token',
      'X-Vouch-Delegation': 'del_demo',
    },
  );

  assert.equal(createCommitResponse.status, 200);
  assert.equal(createCommitResponse.body.status, 'success');
  assert.equal(createCommitResponse.body.result.pushed, false);

  const pendingApproval = await postJson(
    baseUrl,
    '/api/agent/action',
    {
      service: 'github',
      action: 'openPR',
      params: {
        repo: 'demo/repo',
        title: 'Test PR',
        head: 'feature/test',
        base: 'main',
      },
    },
    {
      Authorization: 'Bearer vch_demo_agent_token',
      'X-Vouch-Delegation': delegationResponse.body.delegationId,
    },
  );

  assert.equal(pendingApproval.status, 202);
  assert.equal(pendingApproval.body.status, 'pending_approval');
  assert.match(pendingApproval.body.approvalUrl, /\/approve\//);

  const approveResponse = await fetch(`${baseUrl}/api/audit/approve/${pendingApproval.body.auditId}`, {
    method: 'POST',
  }).then((response) => response.json());

  assert.equal(approveResponse.status, 'approved');
  assert.equal(approveResponse.parentAuditId, pendingApproval.body.auditId);

  await stopApi(server);
  server = null;

  ({ server, baseUrl } = await startApi({ dataDir, demoMode: true }));

  const persistedDelegation = await fetch(`${baseUrl}/api/delegate/${delegationResponse.body.delegationId}`).then((response) => response.json());
  assert.equal(persistedDelegation.delegationId, delegationResponse.body.delegationId);

  const persistedAudit = await fetch(`${baseUrl}/api/audit?auditId=${pendingApproval.body.auditId}`).then((response) => response.json());
  const statuses = persistedAudit.events.map((event) => event.status);
  assert.ok(statuses.includes('pending_approval'));
  assert.ok(statuses.includes('approved'));
});

test('production mode does not seed demo data and uses a real callback route for service connections', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-api-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    nodeEnv: 'development',
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
  }));

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  assert.equal(health.demo, false);

  const delegations = await fetch(`${baseUrl}/api/delegate`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.deepEqual(delegations.delegations, []);

  const audit = await fetch(`${baseUrl}/api/audit`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.deepEqual(audit.events, []);

  const connectResponse = await postJson(baseUrl, '/api/auth/connect/github', {}, liveUserHeaders());
  assert.equal(connectResponse.status, 200);
  const authUrl = new URL(connectResponse.body.authUrl);
  const state = authUrl.searchParams.get('state');
  assert.match(connectResponse.body.authUrl, /^https:\/\/tenant\.example\.auth0\.com\/authorize\?/);
  assert.match(connectResponse.body.authUrl, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A\d+%2Fapi%2Fauth%2Fcallback%3Fservice%3Dgithub/);
  assert.match(state, /^st_/);
  assert.equal(authUrl.searchParams.get('audience'), 'https://tenant.example.auth0.com/me/');
  assert.equal(
    authUrl.searchParams.get('scope'),
    'openid profile email offline_access create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts',
  );

  const callbackResponse = await fetch(`${baseUrl}/api/auth/callback?service=github&state=${state}&code=auth_code_123`, {
    redirect: 'manual',
  });
  assert.equal(callbackResponse.status, 302);
  assert.equal(
    callbackResponse.headers.get('location'),
    'http://localhost:5173/callback?service=github&connected=true',
  );

  const status = await fetch(`${baseUrl}/api/auth/status`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.equal(status.services.github, true);
  assert.equal(status.userId, 'auth0|user_123');
});

test('production auth callback rejects missing state and does not connect the service', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-auth-state-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
  }));

  const callbackResponse = await fetch(`${baseUrl}/api/auth/callback?service=github&code=auth_code_123`, {
    redirect: 'manual',
  });

  assert.equal(callbackResponse.status, 302);
  assert.equal(
    callbackResponse.headers.get('location'),
    'http://localhost:5173/callback?service=github&error=invalid_state&error_description=Missing+or+expired+OAuth+state',
  );

  const status = await fetch(`${baseUrl}/api/auth/status`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.equal(status.services.github, false);
});

test('auth preflight surfaces missing grants, origin allowlists, and service connection mismatches', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-preflight-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const mockManagementClient = {
    clients: {
      async getAll() {
        return {
          data: [
            {
              client_id: 'spa_client_123',
              name: 'Vouch SPA',
              app_type: 'spa',
              callbacks: ['http://localhost:5173/callback'],
              allowed_origins: [],
              web_origins: [],
            },
          ],
        };
      },
    },
    clientGrants: {
      async getAll() {
        return {
          data: [
            {
              audience: 'https://tenant.example.auth0.com/me/',
              client_id: 'spa_client_123',
              scope: ['create:me:connected_accounts'],
            },
          ],
        };
      },
    },
    connections: {
      async getAll({ name }) {
        if (name === 'github-live') {
          return {
            data: [
              {
                id: 'con_github_123',
                name: 'github-live',
                strategy: 'github',
                connected_accounts: { active: true },
              },
            ],
          };
        }

        return { data: [] };
      },
      async getEnabledClients({ id }) {
        if (id === 'con_github_123') {
          return {
            data: {
              clients: [{ client_id: 'spa_client_123' }],
            },
          };
        }

        return {
          data: {
            clients: [],
          },
        };
      },
    },
  };

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
    viteAuth0GithubConnection: 'github-live',
    viteAuth0LinearConnection: 'linear-live',
    configureModules() {
      const management = require(path.join(REPO_ROOT, 'apps/api/src/services/auth0Management.js'));
      management.setManagementClientFactoryForTests(() => mockManagementClient);
    },
  }));

  const preflight = await fetch(`${baseUrl}/api/auth/preflight`).then((response) => response.json());
  const github = preflight.services.find((service) => service.serviceId === 'github');
  const linear = preflight.services.find((service) => service.serviceId === 'linear');

  assert.equal(preflight.ok, false);
  assert.equal(preflight.client.found, true);
  assert.equal(preflight.client.callbackUrlAllowed, true);
  assert.equal(preflight.client.ok, false);
  assert.equal(preflight.grant.found, true);
  assert.deepEqual(preflight.grant.missingScopes, [
    'read:me:connected_accounts',
    'delete:me:connected_accounts',
  ]);
  assert.equal(github.connection.found, true);
  assert.equal(github.connection.enabledForSpa, true);
  assert.equal(github.connection.connectedAccountsActive, true);
  assert.equal(linear.connection.found, false);
  assert.match(
    preflight.recommendedFixes.map((fix) => fix.message).join(' '),
    /Allowed Origins \(CORS\)|Allowed Web Origins|linear-live/,
  );
});

test('auth preflight surfaces recent hosted-flow failures from Auth0 logs', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-preflight-logs-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const mockManagementClient = {
    clients: {
      async getAll() {
        return {
          data: [
            {
              client_id: 'spa_client_123',
              name: 'Vouch SPA',
              app_type: 'spa',
              callbacks: ['http://localhost:5173/callback'],
              allowed_origins: ['http://localhost:5173'],
              web_origins: ['http://localhost:5173'],
            },
          ],
        };
      },
    },
    clientGrants: {
      async getAll() {
        return {
          data: [
            {
              audience: 'https://tenant.example.auth0.com/me/',
              client_id: 'spa_client_123',
              scope: [
                'create:me:connected_accounts',
                'read:me:connected_accounts',
                'delete:me:connected_accounts',
              ],
            },
          ],
        };
      },
    },
    connections: {
      async getAll({ name }) {
        if (name === 'github') {
          return {
            data: [
              {
                id: 'con_github_123',
                name: 'github',
                strategy: 'github',
                connected_accounts: { active: true },
              },
            ],
          };
        }

        return { data: [] };
      },
      async getEnabledClients({ id }) {
        if (id === 'con_github_123') {
          return {
            data: {
              clients: [{ client_id: 'spa_client_123' }],
            },
          };
        }

        return {
          data: {
            clients: [],
          },
        };
      },
    },
    logs: {
      async getAll() {
        return {
          data: [
            {
              log_id: '9001',
              date: '2026-04-02T15:00:00.000Z',
              type: 'f',
              description: 'GitHub OAuth exchange failed',
              connection: 'github',
              connection_id: 'con_github_123',
              client_id: 'spa_client_123',
              client_name: 'Vouch SPA',
              strategy: 'github',
              details: {
                error: {
                  message: 'The configured GitHub client secret was rejected.',
                },
              },
            },
            {
              log_id: '9000',
              date: '2026-04-02T14:59:00.000Z',
              type: 's',
              description: 'Unrelated log entry',
              connection: 'email',
              connection_id: 'con_email_123',
              client_id: 'other_client',
              strategy: 'auth0',
              details: {},
            },
          ],
        };
      },
    },
  };

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
    configureModules() {
      const management = require(path.join(REPO_ROOT, 'apps/api/src/services/auth0Management.js'));
      management.setManagementClientFactoryForTests(() => mockManagementClient);
    },
  }));

  const preflight = await fetch(`${baseUrl}/api/auth/preflight`).then((response) => response.json());
  const github = preflight.services.find((service) => service.serviceId === 'github');

  assert.equal(preflight.ok, true);
  assert.equal(preflight.logs.available, true);
  assert.equal(preflight.logs.count, 2);
  assert.equal(github.connection.found, true);
  assert.equal(github.recentActivity.available, true);
  assert.equal(github.recentActivity.relevantCount, 1);
  assert.equal(github.recentActivity.lastError.summary, 'GitHub OAuth exchange failed');
  assert.equal(github.recentActivity.lastError.detail, 'The configured GitHub client secret was rejected.');
});

test('auth preflight explains missing GitHub refresh token failures', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-preflight-refresh-token-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const mockManagementClient = {
    clients: {
      async getAll() {
        return {
          data: [
            {
              client_id: 'spa_client_123',
              name: 'Vouch SPA',
              app_type: 'spa',
              callbacks: ['http://localhost:5173/callback'],
              allowed_origins: ['http://localhost:5173'],
              web_origins: ['http://localhost:5173'],
            },
          ],
        };
      },
    },
    clientGrants: {
      async getAll() {
        return {
          data: [
            {
              audience: 'https://tenant.example.auth0.com/me/',
              client_id: 'spa_client_123',
              scope: [
                'create:me:connected_accounts',
                'read:me:connected_accounts',
                'delete:me:connected_accounts',
              ],
            },
          ],
        };
      },
    },
    connections: {
      async getAll({ name }) {
        if (name === 'github') {
          return {
            data: [
              {
                id: 'con_github_123',
                name: 'github',
                strategy: 'github',
                connected_accounts: { active: true },
              },
            ],
          };
        }

        return { data: [] };
      },
      async getEnabledClients({ id }) {
        if (id === 'con_github_123') {
          return {
            data: {
              clients: [{ client_id: 'spa_client_123' }],
            },
          };
        }

        return {
          data: {
            clients: [],
          },
        };
      },
    },
    logs: {
      async getAll() {
        return {
          data: [
            {
              log_id: '9002',
              date: '2026-04-02T16:00:00.000Z',
              type: 'f',
              description: 'Missing refresh token',
              connection: 'github',
              connection_id: 'con_github_123',
              client_id: 'spa_client_123',
              client_name: 'Vouch SPA',
              strategy: 'github',
              details: {
                error: {
                  message: 'Connected accounts requires offline access to function properly.',
                },
              },
            },
          ],
        };
      },
    },
  };

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
    configureModules() {
      const management = require(path.join(REPO_ROOT, 'apps/api/src/services/auth0Management.js'));
      management.setManagementClientFactoryForTests(() => mockManagementClient);
    },
  }));

  const preflight = await fetch(`${baseUrl}/api/auth/preflight`).then((response) => response.json());
  const github = preflight.services.find((service) => service.serviceId === 'github');
  const combinedFixes = preflight.recommendedFixes.map((fix) => fix.message).join(' ');
  const combinedIssues = github.issues.map((issue) => issue.message).join(' ');

  assert.equal(preflight.ok, false);
  assert.equal(github.recentActivity.lastError.summary, 'Missing refresh token');
  assert.match(combinedIssues, /did not receive a refresh token/i);
  assert.match(combinedFixes, /Offline Access/i);
  assert.match(combinedFixes, /User-to-server token expiration/i);
});

test('recording a live connection stores the linked Auth0 user id', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-record-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
  }));

  const recordResponse = await postJson(baseUrl, '/api/auth/record/github', {
    connected: true,
    accountId: 'cac_123',
  }, liveUserHeaders());

  assert.equal(recordResponse.status, 200);
  assert.equal(recordResponse.body.detail.userId, 'auth0|user_123');
  assert.equal(recordResponse.body.detail.accountId, 'cac_123');

  const status = await fetch(`${baseUrl}/api/auth/status`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.equal(status.services.github, true);
  assert.equal(status.userId, 'auth0|user_123');
  assert.equal(status.details.github.userId, 'auth0|user_123');
});

test('live demo scenario, audit export, and audit sharing work for the signed-in user', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-prod-demo-scenario-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: 'http://localhost:5173',
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
  }));

  const scenarioResponse = await postJson(baseUrl, '/api/delegate/demo-scenario', {}, liveUserHeaders());
  assert.equal(scenarioResponse.status, 201);
  assert.equal(scenarioResponse.body.agentId, 'cursor');
  assert.match(scenarioResponse.body.inviteUrl, /\/invite\/vch_/);
  assert.equal(scenarioResponse.body.summary.counts.allow > 0, true);
  assert.equal(scenarioResponse.body.scenario.policySummary.stepUpCount > 0, true);

  const delegationsResponse = await fetch(`${baseUrl}/api/delegate`, {
    headers: liveUserHeaders(),
  }).then((response) => response.json());
  assert.equal(delegationsResponse.delegations[0].delegationId, scenarioResponse.body.delegationId);

  const { auditLogger } = require(path.join(REPO_ROOT, 'apps/api/src/services/auditLogger.js'));
  auditLogger.log({
    agent: 'cursor',
    action: 'github.createBranch',
    params: 'feature/judge-demo',
    status: 'allowed',
    delegationId: scenarioResponse.body.delegationId,
  });
  auditLogger.log({
    agent: 'cursor',
    action: 'github.openPR',
    params: 'feature/judge-demo -> main',
    status: 'pending_approval',
    delegationId: scenarioResponse.body.delegationId,
  });

  const csvResponse = await fetch(`${baseUrl}/api/audit/export?format=csv&limit=20`, {
    headers: liveUserHeaders(),
  });
  const csvBody = await csvResponse.text();

  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type') || '', /text\/csv/);
  assert.match(csvBody, /github\.createBranch/);
  assert.match(csvBody, /github\.openPR/);

  const shareResponse = await postJson(baseUrl, '/api/audit/share', {
    title: 'Judge Walkthrough Snapshot',
    limit: 20,
  }, liveUserHeaders());

  assert.equal(shareResponse.status, 201);
  assert.match(shareResponse.body.shareUrl, /\/audit\/share\/shr_/);
  assert.equal(shareResponse.body.snapshot.summary.total >= 2, true);

  const sharedSnapshot = await fetch(`${baseUrl}/api/audit/share/${shareResponse.body.snapshotId}`).then((response) => response.json());
  assert.equal(sharedSnapshot.title, 'Judge Walkthrough Snapshot');
  assert.equal(sharedSnapshot.summary.pendingApproval >= 1, true);
  assert.equal(sharedSnapshot.events.length >= 2, true);
});

test('readyz surfaces missing live configuration before deployment', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-readyz-api-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    frontendUrl: '',
    apiBaseUrl: '',
    auth0Domain: '',
    auth0ClientId: '',
    auth0Audience: '',
    auth0MgmtClientId: '',
    auth0MgmtClientSecret: '',
    auth0TokenVaultClientId: '',
    auth0TokenVaultClientSecret: '',
    auth0TokenVaultPrivateKey: '',
  }));

  const response = await fetch(`${baseUrl}/readyz`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.match(body.issues.join('\n'), /AUTH0_DOMAIN/);
  assert.match(body.issues.join('\n'), /AUTH0_MGMT_CLIENT_SECRET/);
  assert.match(body.issues.join('\n'), /AUTH0_TOKEN_VAULT_CLIENT_ID/);
  assert.match(body.issues.join('\n'), /AUTH0_TOKEN_VAULT_PRIVATE_KEY/);
  assert.match(body.issues.join('\n'), /FRONTEND_URL or API_BASE_URL/);
});

test('runtime-config.js exposes public dashboard config without secrets', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vouch-runtime-config-'));
  let server;
  let baseUrl;

  t.after(async () => {
    if (server) {
      await stopApi(server);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  ({ server, baseUrl } = await startApi({
    dataDir,
    demoMode: false,
    auth0Domain: 'tenant.example.auth0.com',
    auth0ClientId: 'spa_client_123',
    auth0MgmtClientId: 'mgmt_client_123',
    auth0MgmtClientSecret: 'super-secret-value',
  }));

  const response = await fetch(`${baseUrl}/runtime-config.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /window\.__VOUCH_CONFIG__/);
  assert.match(script, /tenant\.example\.auth0\.com/);
  assert.match(script, /spa_client_123/);
  assert.doesNotMatch(script, /super-secret-value/);
  assert.doesNotMatch(script, /AUTH0_MGMT_CLIENT_SECRET/);
});
