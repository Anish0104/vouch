// middleware/verifyM2M.js
// Verify Auth0 M2M JWT in Authorization header.
// In DEMO_MODE, accepts any bearer token.

const { isDemoMode, loadApiEnv } = require('../config/runtime');
loadApiEnv();
const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const DEMO_MODE = isDemoMode();

function verifyM2M(req, res, next) {
  if (DEMO_MODE) {
    // In demo mode, extract a fake agent identity from the token or header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    req.auth = {
      sub: 'demo-agent@clients',
      agentId: token.startsWith('vch_') ? 'cursor-agent' : 'demo-agent',
      aud: process.env.AUTH0_AUDIENCE || 'https://api.vouch.dev',
    };
    return next();
  }

  // Production: verify JWT with Auth0 JWKS
  jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    }),
    audience: process.env.AUTH0_AUDIENCE,
    issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    algorithms: ['RS256'],
  })(req, res, (err) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired M2M token', details: err.message });
    }
    next();
  });
}

module.exports = { verifyM2M };
