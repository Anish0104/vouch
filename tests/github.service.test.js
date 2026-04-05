const test = require('node:test');
const assert = require('node:assert/strict');
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

function loadGitHubService() {
  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  clearApiModuleCache();
  return require(path.join(REPO_ROOT, 'apps/api/src/services/github.js'));
}

function loadGitHubServiceWithStubs({ tokenVaultExports, octokitClass }) {
  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  clearApiModuleCache();

  const tokenVaultPath = path.join(REPO_ROOT, 'apps/api/src/services/tokenVault.js');
  const octokitPath = require.resolve('@octokit/rest');
  const previousTokenVault = require.cache[tokenVaultPath];
  const previousOctokit = require.cache[octokitPath];

  require.cache[tokenVaultPath] = {
    id: tokenVaultPath,
    filename: tokenVaultPath,
    loaded: true,
    exports: tokenVaultExports,
  };

  require.cache[octokitPath] = {
    id: octokitPath,
    filename: octokitPath,
    loaded: true,
    exports: { Octokit: octokitClass },
  };

  const service = require(path.join(REPO_ROOT, 'apps/api/src/services/github.js'));

  function restore() {
    clearApiModuleCache();

    if (previousTokenVault) {
      require.cache[tokenVaultPath] = previousTokenVault;
    } else {
      delete require.cache[tokenVaultPath];
    }

    if (previousOctokit) {
      require.cache[octokitPath] = previousOctokit;
    } else {
      delete require.cache[octokitPath];
    }
  }

  return { service, restore };
}

test('executeGitHubAction creates a commit from file changes', async () => {
  const { executeGitHubAction } = loadGitHubService();
  const calls = [];

  const octokit = {
    git: {
      async getRef(args) {
        calls.push(['getRef', args]);
        return { data: { object: { sha: 'parent-sha' } } };
      },
      async getCommit(args) {
        calls.push(['getCommit', args]);
        return { data: { tree: { sha: 'base-tree-sha' } } };
      },
      async createBlob(args) {
        calls.push(['createBlob', args]);
        return { data: { sha: `blob-${calls.length}` } };
      },
      async createTree(args) {
        calls.push(['createTree', args]);
        return { data: { sha: 'tree-sha' } };
      },
      async createCommit(args) {
        calls.push(['createCommit', args]);
        return { data: { sha: 'commit-sha' } };
      },
      async updateRef() {
        throw new Error('updateRef should not be called while creating a commit');
      },
    },
    repos: {},
    pulls: {},
  };

  const result = await executeGitHubAction(octokit, 'createCommit', {
    repo: 'demo/repo',
    branch: 'feature/test',
    message: 'Ship it',
    files: [
      { path: 'src/index.js', content: 'console.log("hi");' },
      { path: 'README.md', content: '# Vouch' },
    ],
  });

  assert.deepEqual(result, {
    sha: 'commit-sha',
    message: 'Ship it',
    branch: 'feature/test',
    parentSha: 'parent-sha',
    treeSha: 'tree-sha',
    files: ['src/index.js', 'README.md'],
    pushed: false,
  });

  const createTreeCall = calls.find(([name]) => name === 'createTree');
  assert.deepEqual(createTreeCall[1], {
    owner: 'demo',
    repo: 'repo',
    base_tree: 'base-tree-sha',
    tree: [
      { path: 'src/index.js', mode: '100644', type: 'blob', sha: 'blob-3' },
      { path: 'README.md', mode: '100644', type: 'blob', sha: 'blob-4' },
    ],
  });
});

test('executeGitHubAction pushes a prepared commit and validates commitSha', async () => {
  const { executeGitHubAction } = loadGitHubService();
  let updateRefArgs = null;

  const octokit = {
    git: {
      async updateRef(args) {
        updateRefArgs = args;
        return { data: { ref: 'refs/heads/feature/test' } };
      },
    },
    repos: {},
    pulls: {},
  };

  await assert.rejects(
    executeGitHubAction(octokit, 'pushCode', {
      repo: 'demo/repo',
      branch: 'feature/test',
    }),
    /pushCode requires params\.commitSha/,
  );

  const result = await executeGitHubAction(octokit, 'pushCode', {
    repo: 'demo/repo',
    branch: 'feature/test',
    commitSha: 'commit-sha',
    force: true,
  });

  assert.deepEqual(updateRefArgs, {
    owner: 'demo',
    repo: 'repo',
    ref: 'heads/feature/test',
    sha: 'commit-sha',
    force: true,
  });

  assert.deepEqual(result, {
    ref: 'refs/heads/feature/test',
    sha: 'commit-sha',
    pushed: true,
    force: true,
  });
});

test('executeGitHubAction lists recent commits for a branch', async () => {
  const { executeGitHubAction } = loadGitHubService();
  let listCommitsArgs = null;

  const octokit = {
    git: {},
    repos: {
      async listCommits(args) {
        listCommitsArgs = args;
        return {
          data: [
            { sha: 'abc123', commit: { message: 'First commit' } },
            { sha: 'def456', commit: { message: 'Second commit' } },
          ],
        };
      },
    },
    pulls: {},
  };

  const result = await executeGitHubAction(octokit, 'listCommits', {
    repo: 'demo/repo',
    branch: 'main',
    limit: 2,
  });

  assert.deepEqual(listCommitsArgs, {
    owner: 'demo',
    repo: 'repo',
    sha: 'main',
    per_page: 2,
  });

  assert.deepEqual(result, [
    { sha: 'abc123', commit: { message: 'First commit' } },
    { sha: 'def456', commit: { message: 'Second commit' } },
  ]);
});

test('executeGitHubAction returns an existing PR when the branch already has one open', async () => {
  const { executeGitHubAction } = loadGitHubService();
  let listArgs = null;

  const octokit = {
    git: {},
    repos: {},
    pulls: {
      async create() {
        throw new Error('Validation Failed: {"resource":"PullRequest","code":"custom","message":"A pull request already exists for demo:feature/test."}');
      },
      async list(args) {
        listArgs = args;
        return {
          data: [
            {
              number: 42,
              html_url: 'https://github.com/demo/repo/pull/42',
              title: 'Ship it',
            },
          ],
        };
      },
    },
  };

  const result = await executeGitHubAction(octokit, 'openPR', {
    repo: 'demo/repo',
    title: 'Ship it',
    head: 'feature/test',
    base: 'main',
  });

  assert.deepEqual(listArgs, {
    owner: 'demo',
    repo: 'repo',
    state: 'open',
    head: 'demo:feature/test',
    base: 'main',
    per_page: 10,
  });

  assert.equal(result.number, 42);
  assert.equal(result.existing, true);
  assert.equal(result.html_url, 'https://github.com/demo/repo/pull/42');
});

test('callGitHub falls back to the Auth0 GitHub identity token when Token Vault is unavailable', async (t) => {
  const calls = [];

  class FakeOctokit {
    constructor({ auth }) {
      this.git = {};
      this.pulls = {};
      this.repos = {
        listCommits: async (args) => {
          calls.push(['listCommits', auth, args]);
          return {
            data: [
              { sha: 'fallback123', commit: { message: 'Recovered through identity token' } },
            ],
          };
        },
      };
    }
  }

  const { service, restore } = loadGitHubServiceWithStubs({
    tokenVaultExports: {
      fetchToken: async () => {
        throw new Error('Token Vault error: Missing refresh token');
      },
      fetchIdentityProviderToken: async (userId, serviceId) => {
        calls.push(['identityFallback', userId, serviceId]);
        return 'identity-token';
      },
    },
    octokitClass: FakeOctokit,
  });

  t.after(restore);

  const result = await service.callGitHub('github|108176628', 'listCommits', {
    repo: 'demo/repo',
    branch: 'main',
    limit: 1,
  });

  assert.deepEqual(calls[0], ['identityFallback', 'github|108176628', 'github']);
  assert.deepEqual(calls[1], ['listCommits', 'identity-token', {
    owner: 'demo',
    repo: 'repo',
    sha: 'main',
    per_page: 1,
  }]);
  assert.deepEqual(result, [
    { sha: 'fallback123', commit: { message: 'Recovered through identity token' } },
  ]);
});
