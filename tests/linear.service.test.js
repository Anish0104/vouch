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

function loadLinearService() {
  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  clearApiModuleCache();
  return require(path.join(REPO_ROOT, 'apps/api/src/services/linear.js'));
}

test('executeLinearAction lists available teams', async () => {
  const { executeLinearAction } = loadLinearService();
  const calls = [];

  const result = await executeLinearAction(async (query, variables = {}) => {
    calls.push({ query, variables });
    return {
      teams: {
        nodes: [
          { id: 'team_1', key: 'ENG', name: 'Engineering' },
          { id: 'team_2', key: 'OPS', name: 'Operations' },
        ],
      },
    };
  }, 'listTeams');

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /teams\(first: 50\)/);
  assert.deepEqual(result, [
    { id: 'team_1', key: 'ENG', name: 'Engineering' },
    { id: 'team_2', key: 'OPS', name: 'Operations' },
  ]);
});

test('executeLinearAction resolves teamKey before creating an issue', async () => {
  const { executeLinearAction } = loadLinearService();
  const calls = [];

  const result = await executeLinearAction(async (query, variables = {}) => {
    calls.push({ query, variables });

    if (query.includes('query ListTeams')) {
      return {
        teams: {
          nodes: [
            { id: 'team_1', key: 'ENG', name: 'Engineering' },
          ],
        },
      };
    }

    if (query.includes('mutation CreateIssue')) {
      return {
        issueCreate: {
          success: true,
          issue: {
            id: 'issue_123',
            identifier: 'ENG-101',
            title: variables.title,
            url: 'https://linear.app/demo/issue/ENG-101',
            team: {
              id: variables.teamId,
              key: 'ENG',
              name: 'Engineering',
            },
          },
        },
      };
    }

    throw new Error(`Unexpected query: ${query}`);
  }, 'createIssue', {
    title: 'Ship Vouch',
    description: 'Make Linear setup smooth',
    teamKey: 'eng',
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].variables.teamId, 'team_1');
  assert.deepEqual(result, {
    id: 'issue_123',
    identifier: 'ENG-101',
    title: 'Ship Vouch',
    url: 'https://linear.app/demo/issue/ENG-101',
    team: {
      id: 'team_1',
      key: 'ENG',
      name: 'Engineering',
    },
  });
});

test('executeLinearAction explains when multiple teams exist and no team selector is provided', async () => {
  const { executeLinearAction } = loadLinearService();

  await assert.rejects(
    executeLinearAction(async () => ({
      teams: {
        nodes: [
          { id: 'team_1', key: 'ENG', name: 'Engineering' },
          { id: 'team_2', key: 'OPS', name: 'Operations' },
        ],
      },
    }), 'createIssue', {
      title: 'Ship Vouch',
    }),
    /Pass teamId, teamKey, or teamName, or call linear\.listTeams first\. Available teams: ENG \(Engineering\), OPS \(Operations\)/,
  );
});
