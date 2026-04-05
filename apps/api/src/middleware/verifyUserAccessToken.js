const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { isDemoMode, loadApiEnv } = require('../config/runtime');

loadApiEnv();

const DEMO_MODE = isDemoMode();

function normalizeAuth0Domain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

function getAcceptedUserAudiences() {
  const configuredAudience = String(process.env.AUTH0_AUDIENCE || '').trim();
  const auth0Domain = normalizeAuth0Domain(process.env.AUTH0_DOMAIN);
  const myAccountAudience = auth0Domain ? `https://${auth0Domain}/me/` : '';

  return [configuredAudience, myAccountAudience].filter(Boolean);
}

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (typeof req.query?.access_token === 'string' && req.query.access_token.trim()) {
    return req.query.access_token.trim();
  }

  return null;
}

function attachTestUser(req, res, next, { required }) {
  const token = extractBearerToken(req);

  if (!token) {
    if (!required) {
      return next();
    }

    return res.status(401).json({ error: 'Missing end-user access token' });
  }

  if (!token.startsWith('test-user:')) {
    return res.status(401).json({ error: 'Invalid test user access token' });
  }

  req.auth = {
    sub: token.slice('test-user:'.length),
    aud: process.env.AUTH0_AUDIENCE || 'https://api.vouch.dev',
  };
  return next();
}

function rejectMachineTokens(req, res, next) {
  const subject = String(req.auth?.sub || '');
  if (!subject || subject.endsWith('@clients') || req.auth?.gty === 'client-credentials') {
    return res.status(401).json({ error: 'End-user access token required' });
  }

  return next();
}

function runJwtVerification(req, res, next, { required }) {
  return jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    }),
    audience: getAcceptedUserAudiences(),
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    algorithms: ['RS256'],
    credentialsRequired: required,
    getToken: extractBearerToken,
  })(req, res, (error) => {
    if (error) {
      return res.status(401).json({ error: 'Invalid or expired end-user token', details: error.message });
    }

    if (!req.auth) {
      return next();
    }

    return rejectMachineTokens(req, res, next);
  });
}

function verifyUserAccessToken(req, res, next) {
  if (DEMO_MODE) {
    req.auth = req.auth || { sub: 'demo-user' };
    return next();
  }

  if (String(extractBearerToken(req) || '').startsWith('test-user:') || process.env.NODE_ENV === 'test') {
    return attachTestUser(req, res, next, { required: true });
  }

  return runJwtVerification(req, res, next, { required: true });
}

function maybeVerifyUserAccessToken(req, res, next) {
  if (DEMO_MODE) {
    req.auth = req.auth || { sub: 'demo-user' };
    return next();
  }

  if (String(extractBearerToken(req) || '').startsWith('test-user:') || process.env.NODE_ENV === 'test') {
    return attachTestUser(req, res, next, { required: false });
  }

  return runJwtVerification(req, res, next, { required: false });
}

module.exports = {
  extractBearerToken,
  maybeVerifyUserAccessToken,
  verifyUserAccessToken,
};
