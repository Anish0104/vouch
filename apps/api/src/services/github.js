const { Octokit } = require('@octokit/rest');
const { fetchToken, fetchIdentityProviderToken } = require('./tokenVault');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const DEMO_MODE = isDemoMode();

function mockResult(action, params) {
  const ts = new Date().toISOString();
  const mocks = {
    createBranch: { ref: `refs/heads/${params.branchName}`, sha: 'abc123def456', created: true },
    readCode: { content: '// mock file content\nconsole.log("hello world");', path: params.path, encoding: 'utf-8' },
    getFileContents: { content: '// mock file content', path: params.path, sha: 'abc123' },
    listCommits: [
      { sha: 'c0ffee1', commit: { message: 'Initial scaffold' } },
      { sha: 'c0ffee2', commit: { message: 'Add dashboard polish' } },
      { sha: 'c0ffee3', commit: { message: 'Wire Vouch delegation flow' } },
    ],
    listBranches: [{ name: 'main' }, { name: 'develop' }, { name: params.branchName || 'feature/example' }],
    openPR: { number: 42, html_url: 'https://github.com/demo/repo/pull/42', title: params.title, state: 'open' },
    listPRs: [{ number: 41, title: 'Previous PR', state: 'open' }, { number: 40, title: 'Old PR', state: 'closed' }],
    pushCode: { ref: `refs/heads/${params.branch}`, sha: params.commitSha || 'newsha789', pushed: true },
    createCommit: {
      sha: 'commitsha123',
      message: params.message,
      branch: params.branch,
      files: Array.isArray(params.files) ? params.files.map((file) => file.path) : [],
      pushed: false,
    },
  };
  return mocks[action] || { success: true, timestamp: ts };
}

function parseRepo(repo) {
  const [owner, repoName] = String(repo || '').split('/');
  if (!owner || !repoName) {
    throw new Error('GitHub actions require params.repo in the format "owner/repo"');
  }
  return { owner, repoName };
}

function normalizeCommitFiles(files) {
  if (!Array.isArray(files) || !files.length) {
    throw new Error('createCommit requires params.files with at least one file change');
  }

  return files.map((file) => {
    if (!file || typeof file !== 'object') {
      throw new Error('Each createCommit file entry must be an object');
    }

    if (typeof file.path !== 'string' || !file.path.trim()) {
      throw new Error('Each createCommit file entry requires a non-empty path');
    }

    if (typeof file.content !== 'string') {
      throw new Error(`createCommit file ${file.path} requires string content`);
    }

    return {
      path: file.path,
      content: file.content,
      mode: file.mode || '100644',
      type: file.type || 'blob',
    };
  });
}

async function createCommit(octokit, owner, repoName, params) {
  const branch = params.branch || 'main';
  const files = normalizeCommitFiles(params.files);

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
  });
  const parentSha = ref.object.sha;

  const { data: parentCommit } = await octokit.git.getCommit({
    owner,
    repo: repoName,
    commit_sha: parentSha,
  });

  const tree = [];
  for (const file of files) {
    const { data: blob } = await octokit.git.createBlob({
      owner,
      repo: repoName,
      content: file.content,
      encoding: 'utf-8',
    });

    tree.push({
      path: file.path,
      mode: file.mode,
      type: file.type,
      sha: blob.sha,
    });
  }

  const { data: createdTree } = await octokit.git.createTree({
    owner,
    repo: repoName,
    base_tree: parentCommit.tree.sha,
    tree,
  });

  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo: repoName,
    message: params.message || 'Vouch commit',
    tree: createdTree.sha,
    parents: [parentSha],
  });

  return {
    sha: commit.sha,
    message: params.message || 'Vouch commit',
    branch,
    parentSha,
    treeSha: createdTree.sha,
    files: files.map((file) => file.path),
    pushed: false,
  };
}

async function pushCode(octokit, owner, repoName, params) {
  if (typeof params.commitSha !== 'string' || !params.commitSha.trim()) {
    throw new Error('pushCode requires params.commitSha');
  }

  const branch = params.branch || 'main';
  const ref = `heads/${branch}`;

  await octokit.git.updateRef({
    owner,
    repo: repoName,
    ref,
    sha: params.commitSha,
    force: Boolean(params.force),
  });

  return {
    ref: `refs/${ref}`,
    sha: params.commitSha,
    pushed: true,
    force: Boolean(params.force),
  };
}

async function executeGitHubAction(octokit, action, params = {}) {
  const { owner, repoName } = parseRepo(params.repo);

  switch (action) {
    case 'createBranch': {
      const { data: ref } = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${params.from || 'main'}` });
      const result = await octokit.git.createRef({
        owner, repo: repoName,
        ref: `refs/heads/${params.branchName}`,
        sha: ref.object.sha,
      });
      return result.data;
    }
    case 'readCode':
    case 'getFileContents': {
      const { data } = await octokit.repos.getContent({ owner, repo: repoName, path: params.path });
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      return { content, path: params.path, sha: data.sha };
    }
    case 'listCommits': {
      const { data } = await octokit.repos.listCommits({
        owner,
        repo: repoName,
        sha: params.branch || params.sha || 'main',
        per_page: params.limit || 10,
      });
      return data;
    }
    case 'listBranches': {
      const { data } = await octokit.repos.listBranches({ owner, repo: repoName });
      return data;
    }
    case 'openPR': {
      const { data } = await octokit.pulls.create({
        owner, repo: repoName,
        title: params.title,
        body: params.body || '',
        head: params.head,
        base: params.base || 'main',
      });
      return data;
    }
    case 'listPRs': {
      const { data } = await octokit.pulls.list({ owner, repo: repoName, state: params.state || 'open' });
      return data;
    }
    case 'pushCode':
      return pushCode(octokit, owner, repoName, params);
    case 'createCommit':
      return createCommit(octokit, owner, repoName, params);
    default:
      throw new Error(`Unknown GitHub action: ${action}`);
  }
}

async function callGitHub(userId, action, params) {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
    return mockResult(action, params || {});
  }

  const runAction = async (token) => {
    const octokit = new Octokit({ auth: token });
    return executeGitHubAction(octokit, action, params);
  };

  try {
    const token = await fetchToken(userId, 'github');
    return await runAction(token);
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase();
    const canFallback = Boolean(userId) && (
      message.includes('token vault error')
      || message.includes('missing refresh token')
      || message.includes('connected account')
      || message.includes('not linked')
      || message.includes('not found')
    );

    if (!canFallback) {
      throw error;
    }

    console.warn(`[GitHub] Falling back to Auth0 identity token for ${userId}: ${error.message}`);
    const identityToken = await fetchIdentityProviderToken(userId, 'github');
    return runAction(identityToken);
  }
}

module.exports = {
  callGitHub,
  executeGitHubAction,
  normalizeCommitFiles,
  parseRepo,
};
