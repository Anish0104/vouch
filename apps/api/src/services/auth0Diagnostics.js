const {
  getClientRuntimeConfig,
  getFrontendUrl,
  isDemoMode,
  loadApiEnv,
  validateRuntime,
} = require('../config/runtime');
const { getManagementClient } = require('./auth0Management');

loadApiEnv();

const REQUIRED_CONNECTED_ACCOUNT_SCOPES = [
  'create:me:connected_accounts',
  'read:me:connected_accounts',
  'delete:me:connected_accounts',
];

const SERVICE_DOCS = {
  github: 'https://auth0.com/ai/docs/integrations/github',
  linear: 'https://linear.app/developers/oauth-2-0-authentication',
};

const SERVICE_METADATA = {
  github: { required: true },
  linear: { required: false },
};

const RECENT_LOG_LIMIT = 50;

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getMyAccountAudience() {
  const domain = String(process.env.AUTH0_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return domain ? `https://${domain}/me/` : '';
}

function parseJsonApiResponse(result) {
  if (!result) return null;
  if (Array.isArray(result)) return result;
  if (typeof result === 'object' && 'data' in result) return result.data;
  return result;
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toIssue(message, severity = 'error') {
  return { message, severity };
}

function toFix(message) {
  return { message };
}

function collectStringValues(value, depth = 0, values = [], seen = new Set()) {
  if (value === null || value === undefined || depth > 4 || values.length >= 12) {
    return values;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      values.push(trimmed);
    }
    return values;
  }

  if (typeof value !== 'object') {
    return values;
  }

  if (seen.has(value)) {
    return values;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 8)) {
      collectStringValues(entry, depth + 1, values, seen);
      if (values.length >= 12) break;
    }
    return values;
  }

  for (const key of Object.keys(value).slice(0, 12)) {
    collectStringValues(value[key], depth + 1, values, seen);
    if (values.length >= 12) break;
  }

  return values;
}

function describeLog(log) {
  const detailValues = dedupe(collectStringValues(log?.details));
  const description = String(log?.description || '').trim();
  const detail = detailValues.find((value) => value !== description) || detailValues[0] || null;
  const summary = description || detail || String(log?.type || '').trim() || 'Auth0 log event';

  return {
    logId: log?.log_id || null,
    date: typeof log?.date === 'string' ? log.date : null,
    type: log?.type || null,
    connection: log?.connection || null,
    clientId: log?.client_id || null,
    summary,
    detail: detail && detail !== summary ? detail : null,
  };
}

function buildSearchText(log) {
  return [
    log?.type,
    log?.description,
    log?.connection,
    log?.connection_id,
    log?.client_id,
    log?.client_name,
    log?.strategy,
    ...collectStringValues(log?.details),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isFailureLikeLog(log) {
  const type = String(log?.type || '').toLowerCase();
  const text = buildSearchText(log);

  return type.startsWith('f')
    || /(error|failed|failure|invalid|denied|forbidden|unauthorized|missing|misconfig|timeout|timed out|unable|cannot|exception)/.test(text);
}

function logMatchesService({ log, serviceId, connectionName, connectionId, spaClientId }) {
  const normalizedConnectionName = String(connectionName || '').toLowerCase();
  const normalizedServiceId = String(serviceId || '').toLowerCase();
  const connection = String(log?.connection || '').toLowerCase();
  const strategy = String(log?.strategy || '').toLowerCase();
  const text = buildSearchText(log);

  if (connectionId && log?.connection_id === connectionId) {
    return true;
  }

  if (normalizedConnectionName && connection === normalizedConnectionName) {
    return true;
  }

  if (normalizedServiceId && strategy === normalizedServiceId) {
    return true;
  }

  if (normalizedConnectionName && text.includes(normalizedConnectionName)) {
    return true;
  }

  if (normalizedServiceId && text.includes(normalizedServiceId)) {
    return true;
  }

  return Boolean(
    spaClientId
      && log?.client_id === spaClientId
      && /(connected|oauth|token vault|connection)/.test(text),
  );
}

function summarizeRecentActivity(serviceId, connectionName, connection, spaClientId, logsState, recentLogs) {
  if (!logsState?.available || !Array.isArray(recentLogs)) {
    return {
      available: false,
      relevantCount: 0,
      lastEvent: null,
      lastError: null,
    };
  }

  const relevantLogs = recentLogs.filter((log) => logMatchesService({
    log,
    serviceId,
    connectionName,
    connectionId: connection?.id || null,
    spaClientId,
  }));
  const lastEvent = relevantLogs[0] ? describeLog(relevantLogs[0]) : null;
  const lastErrorEntry = relevantLogs.find((log) => isFailureLikeLog(log)) || null;

  return {
    available: true,
    relevantCount: relevantLogs.length,
    lastEvent,
    lastError: lastErrorEntry ? describeLog(lastErrorEntry) : null,
  };
}

function addRecentErrorGuidance(serviceId, recentActivity, fixes, issues) {
  const summary = String(recentActivity?.lastError?.summary || '').toLowerCase();
  const detail = String(recentActivity?.lastError?.detail || '').toLowerCase();
  const message = `${summary} ${detail}`.trim();

  if (!message) {
    return;
  }

  if (serviceId === 'github' && message.includes('missing refresh token')) {
    issues.push(toIssue('GitHub authorized successfully, but Auth0 did not receive a refresh token from GitHub.', 'warning'));
    fixes.push(toFix('In Auth0, open Authentication > Social > GitHub > Connection Permissions and make sure Offline Access is enabled for the connection.'));
    fixes.push(toFix('Open your GitHub App in GitHub Developer Settings and enable Optional Features > User-to-server token expiration so GitHub returns a refresh token.'));
    fixes.push(toFix('If you enabled token expiration after previously authorizing the app, revoke the existing GitHub authorization/grant and reconnect so GitHub issues a fresh token pair.'));
    fixes.push(toFix('If this Auth0 connection is backed by a GitHub OAuth App instead of a GitHub App, recreate it with a GitHub App using callback https://YOUR_AUTH0_DOMAIN/login/callback.'));
  }
}

async function assessServiceConnection(serviceId, connectionName, connection, spaClientId, management, logsState, recentLogs) {
  const issues = [];
  const fixes = [];
  const required = SERVICE_METADATA[serviceId]?.required !== false;
  let enabledClients = [];

  if (connection?.id) {
    try {
      const enabledClientsResult = await management.connections.getEnabledClients({ id: connection.id });
      const enabledClientsPayload = parseJsonApiResponse(enabledClientsResult);
      enabledClients = Array.isArray(enabledClientsPayload?.clients)
        ? enabledClientsPayload.clients.map((client) => client.client_id).filter(Boolean)
        : [];
    } catch (error) {
      issues.push(toIssue(`Could not read enabled clients for connection "${connectionName}": ${error.message}`));
      fixes.push(toFix(`Grant the Auth0 Management API client permission to read connection clients, or inspect connection "${connectionName}" manually in Auth0.`));
    }
  }

  const enabledForSpa = Boolean(spaClientId && enabledClients.includes(spaClientId));
  const connectedAccountsActive = connection?.connected_accounts?.active !== false && Boolean(connection?.connected_accounts);

  if (!connection) {
    if (required) {
      issues.push(toIssue(`Auth0 connection "${connectionName}" was not found.`));
      fixes.push(toFix(`Create the ${serviceId} connection in Auth0 or set ${serviceId === 'github' ? 'VITE_AUTH0_GITHUB_CONNECTION' : 'VITE_AUTH0_LINEAR_CONNECTION'} to the real Auth0 connection name.`));
      fixes.push(toFix(`Enable Connected Accounts for Token Vault on the ${serviceId} connection once the connection exists.`));
    } else {
      issues.push(toIssue(`Optional ${serviceId} connection "${connectionName}" was not found.`, 'info'));
    }
  } else if (!enabledForSpa) {
    issues.push(toIssue(`Connection "${connectionName}" exists but is not enabled for the SPA client ${spaClientId}.`));
    fixes.push(toFix(`In Auth0, open connection "${connectionName}" and enable it for the SPA application ${spaClientId}.`));
  }

  if (connection && !connectedAccountsActive) {
    issues.push(toIssue(`Connection "${connectionName}" does not have Connected Accounts for Token Vault enabled.`));
    fixes.push(toFix(`Open connection "${connectionName}" in Auth0 and enable Connected Accounts for Token Vault.`));
  }

  const recentActivity = summarizeRecentActivity(
    serviceId,
    connectionName,
    connection,
    spaClientId,
    logsState,
    recentLogs,
  );

  addRecentErrorGuidance(serviceId, recentActivity, fixes, issues);

  return {
    serviceId,
    required,
    connectionName,
    docsUrl: SERVICE_DOCS[serviceId] || null,
    connection: connection ? {
      found: true,
      id: connection.id || null,
      name: connection.name || connectionName,
      strategy: connection.strategy || null,
      enabledForSpa,
      enabledClientCount: enabledClients.length,
      connectedAccountsActive,
    } : {
      found: false,
      id: null,
      name: connectionName,
      strategy: null,
      enabledForSpa: false,
      enabledClientCount: 0,
      connectedAccountsActive: false,
    },
    recentActivity,
    issues,
    fixes,
    ok: required ? issues.length === 0 : issues.every((issue) => issue.severity === 'info'),
  };
}

async function buildAuth0Preflight() {
  const runtimeConfig = getClientRuntimeConfig();
  const frontendUrl = normalizeOrigin(getFrontendUrl());
  const callbackUrl = frontendUrl ? `${frontendUrl}/callback` : '';
  const myAccountAudience = getMyAccountAudience();
  const spaClientId = runtimeConfig.VITE_AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_ID || '';
  const configuredConnections = {
    github: runtimeConfig.VITE_AUTH0_GITHUB_CONNECTION || 'github',
    linear: runtimeConfig.VITE_AUTH0_LINEAR_CONNECTION || 'linear',
  };

  const response = {
    demo: isDemoMode(),
    inspectedAt: new Date().toISOString(),
    ok: true,
    environment: {
      auth0Domain: runtimeConfig.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN || '',
      spaClientId,
      frontendUrl,
      callbackUrl,
      myAccountAudience,
      requiredConnectedAccountScopes: REQUIRED_CONNECTED_ACCOUNT_SCOPES,
      configuredConnections,
    },
    runtime: {
      issues: [],
      fixes: [],
      ok: true,
    },
    client: {
      found: false,
      name: null,
      appType: null,
      callbackUrlAllowed: false,
      allowedOrigins: [],
      webOrigins: [],
      issues: [],
      fixes: [],
      ok: false,
    },
    grant: {
      found: false,
      scopes: [],
      missingScopes: [...REQUIRED_CONNECTED_ACCOUNT_SCOPES],
      issues: [],
      fixes: [],
      ok: false,
    },
    services: [],
    logs: {
      inspected: false,
      available: false,
      count: 0,
      issues: [],
      fixes: [],
    },
    recommendedFixes: [],
  };

  if (response.demo) {
    response.runtime.ok = true;
    response.client.ok = true;
    response.grant.ok = true;
    response.services = Object.entries(configuredConnections).map(([serviceId, connectionName]) => ({
      serviceId,
      required: SERVICE_METADATA[serviceId]?.required !== false,
      connectionName,
      docsUrl: SERVICE_DOCS[serviceId] || null,
      connection: {
        found: false,
        id: null,
        name: connectionName,
        strategy: null,
        enabledForSpa: false,
        enabledClientCount: 0,
        connectedAccountsActive: false,
      },
      issues: [toIssue('Demo mode is enabled, so live Auth0 checks are skipped.', 'info')],
      fixes: [],
      recentActivity: {
        available: false,
        relevantCount: 0,
        lastEvent: null,
        lastError: null,
      },
      ok: true,
    }));
    response.recommendedFixes = [];
    return response;
  }

  const runtimeIssues = validateRuntime().filter((issue) => (
    issue.includes('AUTH0')
    || issue.includes('FRONTEND_URL')
    || issue.includes('API_BASE_URL')
    || issue.includes('CORS_ALLOWED_ORIGINS')
  ));

  if (runtimeIssues.length) {
    response.runtime.issues = runtimeIssues.map((issue) => toIssue(issue));
    response.runtime.fixes = runtimeIssues.map((issue) => toFix(issue));
    response.runtime.ok = false;
  }

  if (!response.environment.auth0Domain || !spaClientId || !myAccountAudience) {
    response.ok = false;
    response.recommendedFixes = dedupe([
      ...response.runtime.fixes.map((item) => item.message),
      'Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and FRONTEND_URL before retrying the live Auth0 flow.',
    ]).map(toFix);
    return response;
  }

  try {
    const management = getManagementClient();

    const [clientResult, grantResult, githubConnectionsResult, linearConnectionsResult] = await Promise.all([
      management.clients.getAll({
        fields: 'name,client_id,app_type,callbacks,allowed_origins,web_origins',
        include_fields: true,
      }),
      management.clientGrants.getAll({
        audience: myAccountAudience,
        client_id: spaClientId,
      }),
      management.connections.getAll({
        name: configuredConnections.github,
        fields: 'id,name,strategy,connected_accounts',
        include_fields: true,
      }),
      management.connections.getAll({
        name: configuredConnections.linear,
        fields: 'id,name,strategy,connected_accounts',
        include_fields: true,
      }),
    ]);

    const clients = parseJsonApiResponse(clientResult) || [];
    const grants = parseJsonApiResponse(grantResult) || [];
    const githubConnections = parseJsonApiResponse(githubConnectionsResult) || [];
    const linearConnections = parseJsonApiResponse(linearConnectionsResult) || [];
    let recentLogs = null;

    if (management.logs?.getAll) {
      try {
        const logsResult = await management.logs.getAll({
          per_page: RECENT_LOG_LIMIT,
          sort: 'date:-1',
        });
        recentLogs = parseJsonApiResponse(logsResult) || [];
        response.logs = {
          inspected: true,
          available: true,
          count: Array.isArray(recentLogs) ? recentLogs.length : 0,
          issues: [],
          fixes: [],
        };
      } catch (error) {
        response.logs = {
          inspected: true,
          available: false,
          count: 0,
          issues: [toIssue(`Recent Auth0 log inspection is unavailable: ${error.message}`, 'info')],
          fixes: [toFix('Grant read:logs to the Auth0 Management API application if you want the dashboard to surface the latest hosted-flow failure details.')],
        };
      }
    }

    const client = clients.find((entry) => entry.client_id === spaClientId) || null;
    const callbacks = Array.isArray(client?.callbacks) ? client.callbacks : [];
    const allowedOrigins = Array.isArray(client?.allowed_origins) ? client.allowed_origins : [];
    const webOrigins = Array.isArray(client?.web_origins) ? client.web_origins : [];

    response.client = {
      found: Boolean(client),
      name: client?.name || null,
      appType: client?.app_type || null,
      callbackUrlAllowed: Boolean(callbackUrl && callbacks.includes(callbackUrl)),
      allowedOrigins,
      webOrigins,
      issues: [],
      fixes: [],
      ok: false,
    };

    if (!client) {
      response.client.issues.push(toIssue(`SPA client ${spaClientId} was not found in Auth0.`));
      response.client.fixes.push(toFix(`Verify that AUTH0_CLIENT_ID points to the SPA application you are using in Auth0.`));
    } else {
      if (!response.client.callbackUrlAllowed) {
        response.client.issues.push(toIssue(`Callback URL ${callbackUrl} is not allowed on the SPA client.`));
        response.client.fixes.push(toFix(`Add ${callbackUrl} to Allowed Callback URLs for the SPA application ${spaClientId}.`));
      }

      if (frontendUrl && !webOrigins.includes(frontendUrl)) {
        response.client.issues.push(toIssue(`Frontend origin ${frontendUrl} is missing from Allowed Web Origins.`));
        response.client.fixes.push(toFix(`Add ${frontendUrl} to Allowed Web Origins for the SPA application ${spaClientId}.`));
      }

      if (frontendUrl && !allowedOrigins.includes(frontendUrl)) {
        response.client.issues.push(toIssue(`Frontend origin ${frontendUrl} is missing from Allowed Origins (CORS).`));
        response.client.fixes.push(toFix(`Add ${frontendUrl} to Allowed Origins (CORS) for the SPA application ${spaClientId}.`));
      }
    }

    response.client.ok = response.client.issues.length === 0;

    const grantedScopes = dedupe(
      grants.flatMap((grant) => Array.isArray(grant.scope) ? grant.scope : []),
    );
    const missingScopes = REQUIRED_CONNECTED_ACCOUNT_SCOPES.filter((scope) => !grantedScopes.includes(scope));

    response.grant = {
      found: grants.length > 0,
      scopes: grantedScopes,
      missingScopes,
      issues: [],
      fixes: [],
      ok: false,
    };

    if (!grants.length) {
      response.grant.issues.push(toIssue(`No Auth0 client grant was found for audience ${myAccountAudience}.`));
      response.grant.fixes.push(toFix(`Create a client grant for SPA client ${spaClientId} against ${myAccountAudience}.`));
    }

    if (missingScopes.length) {
      response.grant.issues.push(toIssue(`The SPA client grant is missing Connected Accounts scopes: ${missingScopes.join(', ')}.`));
      response.grant.fixes.push(toFix(`Add ${missingScopes.join(', ')} to the SPA client grant for ${myAccountAudience}.`));
    }

    response.grant.ok = response.grant.issues.length === 0;

    response.services = [
      await assessServiceConnection(
        'github',
        configuredConnections.github,
        githubConnections[0] || null,
        spaClientId,
        management,
        response.logs,
        recentLogs,
      ),
      await assessServiceConnection(
        'linear',
        configuredConnections.linear,
        linearConnections[0] || null,
        spaClientId,
        management,
        response.logs,
        recentLogs,
      ),
    ];
  } catch (error) {
    response.runtime.ok = false;
    response.runtime.issues.push(toIssue(`Auth0 Management API inspection failed: ${error.message}`));
    response.runtime.fixes.push(toFix('Verify AUTH0_MGMT_CLIENT_ID and AUTH0_MGMT_CLIENT_SECRET, and ensure the Management API client has permission to read clients, client grants, and connections.'));
  }

  response.recommendedFixes = dedupe([
    ...response.runtime.fixes.map((item) => item.message),
    ...response.client.fixes.map((item) => item.message),
    ...response.grant.fixes.map((item) => item.message),
    ...response.services.flatMap((service) => service.fixes.map((item) => item.message)),
    ...response.logs.fixes.map((item) => item.message),
    'If the Auth0-hosted page still shows invalid_request after these checks pass, open the connection in Auth0 and verify Connected Accounts for Token Vault is enabled and the provider credentials are valid.',
  ]).map(toFix);

  response.ok = response.runtime.ok
    && response.client.ok
    && response.grant.ok
    && response.services.every((service) => service.required ? service.ok : true);

  return response;
}

module.exports = {
  buildAuth0Preflight,
  getMyAccountAudience,
  REQUIRED_CONNECTED_ACCOUNT_SCOPES,
};
