const { callServiceWithVault } = require('./tokenVault');
const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();

const DEMO_MODE = isDemoMode();

function mockResult(action, params) {
  const mocks = {
    createIssue: { id: `ISS-${Math.floor(Math.random() * 900 + 100)}`, title: params.title, url: 'https://linear.app/demo/issue/ISS-100' },
    listIssues: [
      { id: 'ISS-99', title: 'Previous issue', state: 'Todo' },
      { id: 'ISS-98', title: 'Another issue', state: 'In Progress' },
    ],
    updateIssue: { id: params.id, updated: true },
  };
  return mocks[action] || { success: true };
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

    switch (action) {
      case 'createIssue': {
        const query = `
          mutation CreateIssue($title: String!, $description: String, $teamId: String!) {
            issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
              success issue { id title url }
            }
          }`;
        const data = await callLinearApi(query, {
          title: params.title,
          description: params.description,
          teamId: params.teamId,
        });
        return data.issueCreate.issue;
      }
      case 'listIssues': {
        const query = `query { issues(first: 20) { nodes { id title state { name } } } }`;
        const data = await callLinearApi(query);
        return data.issues.nodes;
      }
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
  });
}

module.exports = { callLinear };
