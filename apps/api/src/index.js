// src/index.js — Vouch API Server

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  assertValidRuntime,
  getAllowedOrigins,
  getBodyLimit,
  getClientRuntimeConfig,
  getDashboardDistPath,
  getDataDir,
  getFrontendUrl,
  getTrustProxy,
  isDemoMode,
  loadApiEnv,
  shouldServeDashboard,
  validateRuntime,
} = require('./config/runtime');
const { auditLogger } = require('./services/auditLogger');
const { router: agentRouter } = require('./routes/agent');
const delegateRouter = require('./routes/delegate');
const auditRouter = require('./routes/audit');
const approveRouter = require('./routes/approve');
const authRouter = require('./routes/auth');

loadApiEnv();

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isSecureRequest = req.secure || forwardedProto === 'https';

  if (isSecureRequest && !isDemoMode()) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

function createCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Vouch-Delegation'],
  };
}

function attachDashboard(app) {
  if (!shouldServeDashboard()) {
    return;
  }

  const dashboardDistPath = getDashboardDistPath();
  const dashboardIndexPath = path.join(dashboardDistPath, 'index.html');

  if (!fs.existsSync(dashboardIndexPath)) {
    return;
  }

  app.use(express.static(dashboardDistPath, {
    index: false,
    maxAge: isDemoMode() ? 0 : '1h',
  }));

  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api/')
      || req.path === '/health'
      || req.path === '/readyz'
      || req.path === '/runtime-config.js'
    ) {
      next();
      return;
    }

    res.sendFile(dashboardIndexPath);
  });
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', getTrustProxy());

  // ─── Middleware ────────────────────────────────────────────────────────────
  app.use(applySecurityHeaders);
  app.use(cors(createCorsOptions()));

  app.use((req, res, next) => {
    if (req.path === '/api/audit/stream') return next();
    express.json({ limit: getBodyLimit() })(req, res, next);
  });

  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.get('/runtime-config.js', (req, res) => {
    res.type('application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`window.__VOUCH_CONFIG__ = Object.freeze(${JSON.stringify(getClientRuntimeConfig())});\n`);
  });

  // ─── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/agent', agentRouter);
  app.use('/api/delegate', delegateRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api', approveRouter);
  app.use('/api/auth', authRouter);

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'vouch-api',
      version: '1.0.0',
      demo: isDemoMode(),
      frontendUrl: getFrontendUrl(),
      dashboardServed: shouldServeDashboard(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/readyz', (req, res) => {
    const issues = validateRuntime();

    res.status(issues.length ? 503 : 200).json({
      status: issues.length ? 'degraded' : 'ready',
      demo: isDemoMode(),
      issues,
      dataDir: getDataDir(),
      dashboardServed: shouldServeDashboard(),
      timestamp: new Date().toISOString(),
    });
  });

  attachDashboard(app);

  // ─── 404 Handler ──────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  });

  // ─── Error Handler ────────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

function installShutdownHandlers(server) {
  const shutdown = (signal) => {
    console.log(`\n[Shutdown] Received ${signal}. Closing Vouch API...`);
    auditLogger.closeAllClients();

    server.close((error) => {
      if (error) {
        console.error('[Shutdown] Failed to close server cleanly:', error.message);
        process.exit(1);
      }

      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

function startServer() {
  assertValidRuntime();

  const app = createApp();
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  const FRONTEND_URL = getFrontendUrl();

  const server = app.listen(PORT, HOST, () => {
    const mode = isDemoMode() ? '🎭 DEMO' : '🔐 PRODUCTION';
    console.log(`\n🛡️  Vouch API running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Frontend: ${FRONTEND_URL}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Ready: http://localhost:${PORT}/readyz\n`);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  installShutdownHandlers(server);

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer,
};
