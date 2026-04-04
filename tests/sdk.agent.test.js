const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function clearSdkModuleCache() {
  const sdkRoot = path.join(REPO_ROOT, 'packages/vouch-sdk');

  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath.startsWith(sdkRoot)) {
      delete require.cache[modulePath];
    }
  }
}

function loadSdkModules() {
  clearSdkModuleCache();
  return {
    agent: require(path.join(REPO_ROOT, 'packages/vouch-sdk/src/agent.js')),
    client: require(path.join(REPO_ROOT, 'packages/vouch-sdk/src/client.js')),
  };
}

test('extractBranchNameFromTask and buildDemoToolCalls follow the requested demo flow', () => {
  process.env.DEMO_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.VOUCH_REPO = 'demo/repo';

  const { agent } = loadSdkModules();
  assert.deepEqual(
    agent.tools.map((tool) => tool.function.name),
    [
      'github_createBranch',
      'github_readCode',
      'github_listCommits',
      'github_openPR',
      'linear_createIssue',
    ],
  );
  const branchName = agent.extractBranchNameFromTask('create a branch called feature/test-vouch');
  assert.equal(branchName, 'feature/test-vouch');

  const calls = agent.buildDemoToolCalls('create a branch called feature/test-vouch');
  assert.deepEqual(calls, [
    {
      name: 'github_readCode',
      arguments: { repo: 'demo/repo', path: 'README.md' },
    },
    {
      name: 'github_listCommits',
      arguments: { repo: 'demo/repo', branch: 'main', limit: 5 },
    },
    {
      name: 'github_createBranch',
      arguments: { repo: 'demo/repo', branchName: 'feature/test-vouch', from: 'main' },
    },
  ]);
});

test('executeToolCall prints pending approval info and keeps polling through Vouch', async () => {
  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';

  const { agent } = loadSdkModules();
  const calls = [];
  const policy = {
    allow: ['github.openPR'],
    deny: [],
    stepUpRequired: ['github.openPR'],
  };

  const result = await agent.executeToolCall(
    {
      name: 'github_openPR',
      arguments: {
        repo: 'demo/repo',
        title: 'Ship it',
        head: 'feature/test-vouch',
      },
    },
    {
      quiet: true,
      policy,
      vouch: {
        async callAction(toolName, params) {
          calls.push(['callAction', toolName, params]);
          return {
            status: 'pending_approval',
            approvalUrl: 'http://localhost:5173/approve/aud_123',
            auditId: 'aud_123',
          };
        },
        async waitForApproval(auditId, options) {
          calls.push(['waitForApproval', auditId, options]);
          return {
            status: 'approved',
            auditId,
            event: { id: 'aud_123_approved' },
          };
        },
      },
    },
  );

  assert.equal(result.status, 'pending_approval');
  assert.equal(result.approval.status, 'approved');
  assert.deepEqual(calls, [
    ['callAction', 'github_openPR', { repo: 'demo/repo', title: 'Ship it', head: 'feature/test-vouch' }],
    ['waitForApproval', 'aud_123', { intervalMs: 3000, timeoutMs: 0 }],
  ]);
});

test('getM2MToken returns mock-token in demo mode and uses Auth0 in production mode', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DEMO_MODE = 'true';

  let { client } = loadSdkModules();
  assert.equal(await client.getM2MToken(), 'mock-token');

  process.env.DEMO_MODE = 'false';
  process.env.AUTH0_DOMAIN = 'tenant.example.auth0.com';
  process.env.AUTH0_AUDIENCE = 'https://api.vouch.dev';
  process.env.VOUCH_M2M_CLIENT_ID = 'client_id';
  process.env.VOUCH_M2M_CLIENT_SECRET = 'client_secret';

  ({ client } = loadSdkModules());
  const axios = require('axios');
  const originalPost = axios.post;

  const recorded = [];
  axios.post = async (url, payload) => {
    recorded.push([url, payload]);
    return { data: { access_token: 'm2m-token-123' } };
  };

  try {
    const token = await client.getM2MToken();
    assert.equal(token, 'm2m-token-123');
    assert.deepEqual(recorded, [[
      'https://tenant.example.auth0.com/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: 'client_id',
        client_secret: 'client_secret',
        audience: 'https://api.vouch.dev',
      },
    ]]);
  } finally {
    axios.post = originalPost;
  }
});
