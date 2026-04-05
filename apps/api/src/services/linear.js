const { callServiceWithVault } = require('./tokenVault');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const DEMO_MODE = isDemoMode();

function mockResult(action, params) {
  const mockTeams = [
    { id: 'team_vouch', key: 'VCH', name: 'Vouch' },
    { id: 'team_ops', key: 'OPS', name: 'Operations' },
  ];
  const mocks = {
    createIssue: {
      id: `ISS-${Math.floor(Math.random() * 900 + 100)}`,
      identifier: `${params.teamKey || 'VCH'}-${Math.floor(Math.random() * 900 + 100)}`,
      title: params.title,
      url: 'https://linear.app/demo/issue/ISS-100',
      team: mockTeams.find((team) => team.id === params.teamId || team.key === params.teamKey) || mockTeams[0],
    },
    listIssues: [
      {
        id: 'ISS-99',
        identifier: 'VCH-99',
        title: 'Previous issue',
        state: { name: 'Todo' },
        team: mockTeams[0],
        url: 'https://linear.app/demo/issue/VCH-99',
      },
      {
        id: 'ISS-98',
        identifier: 'OPS-98',
        title: 'Another issue',
        state: { name: 'In Progress' },
        team: mockTeams[1],
        url: 'https://linear.app/demo/issue/OPS-98',
      },
    ],
    listTeams: mockTeams,
    updateIssue: { id: params.id, updated: true },
  };
  return mocks[action] || { success: true };
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeTeam(team) {
  if (!team || typeof team !== 'object') {
    return null;
  }

  const id = cleanString(team.id);
  if (!id) {
    return null;
  }

  return {
    id,
    key: cleanString(team.key) || undefined,
    name: cleanString(team.name) || undefined,
  };
}

function summarizeTeams(teams) {
  return teams
    .map((team) => {
      const key = team.key || team.id;
      return team.name ? `${key} (${team.name})` : key;
    })
    .join(', ');
}

async function listTeams(callLinearApi) {
  const query = `
    query ListTeams {
      teams(first: 50) {
        nodes {
          id
          key
          name
        }
      }
    }`;
  const data = await callLinearApi(query);
  return (data.teams?.nodes || [])
    .map(normalizeTeam)
    .filter(Boolean);
}

async function resolveTeam(callLinearApi, params = {}) {
  const explicitTeamId = cleanString(params.teamId);
  if (explicitTeamId) {
    return {
      id: explicitTeamId,
      key: cleanString(params.teamKey) || undefined,
      name: cleanString(params.teamName) || undefined,
    };
  }

  const requestedKey = cleanString(params.teamKey).toLowerCase();
  const requestedName = cleanString(params.teamName).toLowerCase();
  const teams = await listTeams(callLinearApi);

  if (teams.length === 0) {
    throw new Error('No Linear teams were found for this connected account. Confirm the Linear workspace is accessible.');
  }

  if (requestedKey || requestedName) {
    const match = teams.find((team) =>
      (requestedKey && cleanString(team.key).toLowerCase() === requestedKey)
      || (requestedName && cleanString(team.name).toLowerCase() === requestedName),
    );

    if (match) {
      return match;
    }

    throw new Error(
      `Could not find a Linear team matching "${params.teamKey || params.teamName}". Available teams: ${summarizeTeams(teams)}`,
    );
  }

  if (teams.length === 1) {
    return teams[0];
  }

  throw new Error(
    `Linear createIssue requires a team when the connected account can access multiple teams. `
    + `Pass teamId, teamKey, or teamName, or call linear.listTeams first. Available teams: ${summarizeTeams(teams)}`,
  );
}

async function executeLinearAction(callLinearApi, action, params = {}) {
  switch (action) {
    case 'createIssue': {
      if (!cleanString(params.title)) {
        throw new Error('Linear createIssue requires params.title');
      }

      const team = await resolveTeam(callLinearApi, params);
      const query = `
        mutation CreateIssue($title: String!, $description: String, $teamId: String!) {
          issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
            success
            issue {
              id
              identifier
              title
              url
              team {
                id
                key
                name
              }
            }
          }
        }`;
      const data = await callLinearApi(query, {
        title: params.title,
        description: params.description,
        teamId: team.id,
      });
      const issue = data.issueCreate?.issue;
      if (!data.issueCreate?.success || !issue?.id) {
        throw new Error('Linear issueCreate did not return a created issue');
      }
      return {
        ...issue,
        team: normalizeTeam(issue.team) || team,
      };
    }
    case 'listIssues': {
      const query = `
        query ListIssues {
          issues(first: 20) {
            nodes {
              id
              identifier
              title
              url
              state { name }
              team {
                id
                key
                name
              }
            }
          }
        }`;
      const data = await callLinearApi(query);
      return (data.issues?.nodes || []).map((issue) => ({
        ...issue,
        team: normalizeTeam(issue.team),
      }));
    }
    case 'listTeams':
      return listTeams(callLinearApi);
    case 'updateIssue': {
      const query = `
        mutation UpdateIssue($id: String!, $title: String) {
          issueUpdate(id: $id, input: { title: $title }) { success }
        }`;
      const data = await callLinearApi(query, { id: params.id, title: params.title });
      return data.issueUpdate;
    }
    default:
      throw new Error(`Unknown Linear action: ${action}`);
  }
}

async function callLinear(userId, action, params) {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 300));
    return mockResult(action, params || {});
  }

  return callServiceWithVault(userId, 'linear', async (token) => {
    const LINEAR_API = 'https://api.linear.app/graphql';

    const headers = {
      Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    async function callLinearApi(query, variables = {}) {
      const response = await fetch(LINEAR_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.errors?.[0]?.message || `Linear request failed with status ${response.status}`);
      }

      if (payload.errors?.length) {
        throw new Error(payload.errors[0].message);
      }

      return payload.data;
    }
    return executeLinearAction(callLinearApi, action, params);
  });
}

module.exports = {
  callLinear,
  executeLinearAction,
  listTeams,
  normalizeTeam,
  resolveTeam,
};
