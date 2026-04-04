// routes/auth.js
// Auth0 callback and connection status routes

const express = require('express');
const router = express.Router();
const { connectionStore } = require('../services/connectionStore');
const { authStateStore } = require('../services/authStateStore');
const { buildAuth0Preflight, getMyAccountAudience, REQUIRED_CONNECTED_ACCOUNT_SCOPES } = require('../services/auth0Diagnostics');
const {
  getApiBaseUrl,
  getFrontendUrl,
  isDemoMode,
  loadApiEnv,
} = require('../config/runtime');
loadApiEnv();

const DEMO_MODE = isDemoMode();
const SUPPORTED_SERVICES = new Set(['github', 'linear']);
const CONNECTED_ACCOUNTS_AUDIENCE = getMyAccountAudience();
const CONNECTED_ACCOUNTS_SCOPE = ['openid', 'profile', 'email', 'offline_access', ...REQUIRED_CONNECTED_ACCOUNT_SCOPES].join(' ');

function buildCallbackUrl({ service, error, errorDescription, connected = false }) {
  const frontendUrl = new URL(`${getFrontendUrl()}/callback`);

  if (service) frontendUrl.searchParams.set('service', service);

  if (error) {
    frontendUrl.searchParams.set('error', error);
    if (errorDescription) {
      frontendUrl.searchParams.set('error_description', errorDescription);
    }
  } else if (connected) {
    frontendUrl.searchParams.set('connected', 'true');
  }

  return frontendUrl.toString();
}

function getService(req, res) {
  const { service } = req.params;
  if (!SUPPORTED_SERVICES.has(service)) {
    res.status(400).json({ error: `Unsupported service: ${service}` });
    return null;
  }
  return service;
}

// GET /api/auth/status — check connected services
router.get('/status', (req, res) => {
  const details = connectionStore.getAll();
  const services = connectionStore.getStatusMap();
  const hasConnectedService = Object.values(services).some(Boolean);
  const firstConnectedUserId = Object.values(details).find((entry) => entry?.connected)?.userId || null;

  return res.json({
    authenticated: DEMO_MODE || hasConnectedService,
    userId: DEMO_MODE ? 'demo-user' : firstConnectedUserId,
    services,
    details,
    demo: DEMO_MODE,
  });
});

router.get('/preflight', async (req, res) => {
  const diagnostics = await buildAuth0Preflight();
  res.json(diagnostics);
});

// POST /api/auth/connect/:service — initiate OAuth connection
router.post('/connect/:service', (req, res) => {
  const service = getService(req, res);
  if (!service) return;

  if (DEMO_MODE) {
    connectionStore.setConnected(service, true);
    return res.json({ success: true, service, connected: true, demo: true });
  }

  if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID) {
    return res.status(500).json({
      error: 'Missing AUTH0_DOMAIN or AUTH0_CLIENT_ID for service connection flow',
    });
  }

  // In production, redirect to Auth0 connection flow
  const authorizeUrl = new URL(`https://${process.env.AUTH0_DOMAIN}/authorize`);
  const apiBaseUrl = getApiBaseUrl(req);
  const authState = authStateStore.create(service);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', process.env.AUTH0_CLIENT_ID || '');
  authorizeUrl.searchParams.set('audience', CONNECTED_ACCOUNTS_AUDIENCE);
  authorizeUrl.searchParams.set('scope', CONNECTED_ACCOUNTS_SCOPE);
  authorizeUrl.searchParams.set('connection', service);
  authorizeUrl.searchParams.set('state', authState.state);
  authorizeUrl.searchParams.set('redirect_uri', `${apiBaseUrl}/api/auth/callback?service=${service}`);

  res.json({ authUrl: authorizeUrl.toString() });
});

// POST /api/auth/disconnect/:service
router.post('/disconnect/:service', (req, res) => {
  const service = getService(req, res);
  if (!service) return;

  if (DEMO_MODE) {
    connectionStore.setConnected(service, false);
    return res.json({ success: true, service, connected: false });
  }

  connectionStore.setConnected(service, false);
  res.json({ success: true, service, connected: false });
});

// GET /api/auth/callback — Auth0 OAuth callback
router.get('/callback', (req, res) => {
  const requestedService = typeof req.query.service === 'string' ? req.query.service : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const error = typeof req.query.error === 'string' ? req.query.error : '';
  const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : '';
  const stateRecord = DEMO_MODE ? null : authStateStore.consume(state);
  const service = stateRecord?.service || requestedService;

  if (!DEMO_MODE) {
    if (!stateRecord) {
      return res.redirect(buildCallbackUrl({
        service: requestedService,
        error: 'invalid_state',
        errorDescription: 'Missing or expired OAuth state',
      }));
    }

    if (requestedService && requestedService !== stateRecord.service) {
      return res.redirect(buildCallbackUrl({
        service: stateRecord.service,
        error: 'invalid_service',
        errorDescription: 'OAuth callback service mismatch',
      }));
    }

    if (!error && !code) {
      return res.redirect(buildCallbackUrl({
        service: stateRecord.service,
        error: 'missing_code',
        errorDescription: 'OAuth callback did not include an authorization code',
      }));
    }
  }

  if (service && SUPPORTED_SERVICES.has(service) && !error) {
    connectionStore.setConnected(service, true);
  }

  res.redirect(buildCallbackUrl({
    service,
    error,
    errorDescription,
    connected: !error,
  }));
});

router.post('/record/:service', (req, res) => {
  const service = getService(req, res);
  if (!service) return;

  const { connected = true, userId = null, accountId = null } = req.body || {};
  const nextState = connectionStore.setConnected(service, Boolean(connected), {
    userId,
    accountId,
  });

  res.json({
    success: true,
    service,
    connected: nextState,
    detail: connectionStore.getAll()[service],
  });
});

module.exports = router;
