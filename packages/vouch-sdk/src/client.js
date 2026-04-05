const axios = require('axios');
const { isDemoMode, loadSdkEnv } = require('./env');

loadSdkEnv();

const toolActionMap = {
  github_createBranch: { service: 'github', action: 'createBranch' },
  github_readCode: { service: 'github', action: 'readCode' },
  github_listCommits: { service: 'github', action: 'listCommits' },
  github_getFileContents: { service: 'github', action: 'getFileContents' },
  github_listBranches: { service: 'github', action: 'listBranches' },
  github_listPRs: { service: 'github', action: 'listPRs' },
  github_openPR: { service: 'github', action: 'openPR' },
  github_createCommit: { service: 'github', action: 'createCommit' },
  github_pushCode: { service: 'github', action: 'pushCode' },
  linear_createIssue: { service: 'linear', action: 'createIssue' },
  linear_listTeams: { service: 'linear', action: 'listTeams' },
  linear_listIssues: { service: 'linear', action: 'listIssues' },
  linear_updateIssue: { service: 'linear', action: 'updateIssue' },
};

function normalizeAuth0Domain(domain) {
  return String(domain || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

async function getM2MToken(options = {}) {
  if (options.accessToken) {
    return options.accessToken;
  }

  if (isDemoMode()) {
    return 'mock-token';
  }

  const domain = normalizeAuth0Domain(options.domain || process.env.AUTH0_DOMAIN || process.env.VOUCH_AUTH0_DOMAIN);
  const clientId = options.clientId || process.env.VOUCH_M2M_CLIENT_ID;
  const clientSecret = options.clientSecret || process.env.VOUCH_M2M_CLIENT_SECRET;
  const audience = options.audience || process.env.AUTH0_AUDIENCE || process.env.VOUCH_AUTH0_AUDIENCE || 'https://api.vouch.dev';

  if (!domain || !clientId || !clientSecret) {
    throw new Error('Missing Auth0 M2M configuration for the Vouch agent');
  }

  const response = await axios.post(`https://${domain}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    audience,
  });

  if (!response.data?.access_token) {
    throw new Error('Auth0 token response did not include access_token');
  }

  return response.data.access_token;
}

class VouchClient {
  constructor(delegationId, options = {}) {
    this.delegationId = delegationId || process.env.VOUCH_DELEGATION_ID || (isDemoMode() ? 'del_demo' : '');
    this.baseUrl = (options.baseUrl || process.env.VOUCH_API_URL || 'http://localhost:3001').replace(/\/$/, '');
    this.accessToken = options.accessToken || null;
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeout || 30000,
    });
  }

  async getAccessToken() {
    if (!this.accessToken) {
      this.accessToken = await getM2MToken();
    }
    return this.accessToken;
  }

  async callAction(toolName, params = {}) {
    const mapped = toolActionMap[toolName];
    if (!mapped) {
      throw new Error(`Unknown Vouch tool: ${toolName}`);
    }

    if (!this.delegationId) {
      throw new Error('Missing VOUCH_DELEGATION_ID');
    }

    const token = await this.getAccessToken();
    const response = await this.http.post(
      '/api/agent/action',
      {
        service: mapped.service,
        action: mapped.action,
        params,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Vouch-Delegation': this.delegationId,
        },
        validateStatus: () => true,
      },
    );

    if (!response.data) {
      throw new Error(`Vouch API returned an empty response for ${toolName}`);
    }

    return response.data;
  }

  async waitForApproval(auditId, options = {}) {
    const intervalMs = options.intervalMs || 3000;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 0;
    const startedAt = Date.now();

    while (timeoutMs <= 0 || Date.now() - startedAt < timeoutMs) {
      const response = await this.http.get('/api/audit', {
        params: { limit: 20, auditId },
      });

      const match = (response.data.events || []).find((event) =>
        event.parentAuditId === auditId ||
        event.id === `${auditId}_approved` ||
        event.id === `${auditId}_rejected` ||
        event.id === `${auditId}_error`,
      );

      if (match?.status === 'approved') {
        return { status: 'approved', auditId, event: match };
      }

      if (match?.status === 'rejected') {
        return { status: 'rejected', auditId, event: match };
      }

      if (match?.status === 'error') {
        return { status: 'error', auditId, event: match };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return { status: 'timeout', auditId };
  }
}

module.exports = {
  getM2MToken,
  isDemoMode,
  normalizeAuth0Domain,
  VouchClient,
  toolActionMap,
};
