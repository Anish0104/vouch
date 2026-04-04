const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

let loaded = false;
const LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function loadFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  dotenv.config({
    path: filePath,
    override: false,
  });
}

function loadApiEnv() {
  if (loaded) {
    return;
  }

  const apiRoot = path.resolve(__dirname, '..', '..');
  const repoRoot = path.resolve(apiRoot, '..', '..');

  // Prefer package-local config, but keep shell-provided variables authoritative.
  loadFile(path.join(apiRoot, '.env'));
  loadFile(path.join(repoRoot, '.env'));

  loaded = true;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).trim().toLowerCase() === 'true';
}

function normalizeUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized || '';
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => normalizeUrl(entry))
    .filter(Boolean);
}

function isDemoMode() {
  return process.env.DEMO_MODE === 'true';
}

function getApiRoot() {
  return path.resolve(__dirname, '..', '..');
}

function getRepoRoot() {
  return path.resolve(getApiRoot(), '..', '..');
}

function getDataDir() {
  return process.env.VOUCH_DATA_DIR
    ? path.resolve(process.env.VOUCH_DATA_DIR)
    : path.resolve(getRepoRoot(), '.vouch-data');
}

function getFrontendUrl() {
  return normalizeUrl(process.env.FRONTEND_URL) || normalizeUrl(process.env.API_BASE_URL) || 'http://localhost:5173';
}

function getApiBaseUrl(req) {
  const configured = normalizeUrl(process.env.API_BASE_URL);
  if (configured) {
    return configured;
  }

  if (!req) {
    return '';
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();

  return host ? `${protocol}://${host}` : '';
}

function getAllowedOrigins() {
  const configuredOrigins = [
    normalizeUrl(process.env.FRONTEND_URL),
    ...splitList(process.env.CORS_ALLOWED_ORIGINS),
  ].filter(Boolean);

  const origins = isDemoMode()
    ? [...configuredOrigins, ...LOCAL_FRONTEND_ORIGINS]
    : configuredOrigins;

  return Array.from(new Set(origins));
}

function getDashboardDistPath() {
  if (process.env.DASHBOARD_DIST_DIR) {
    return path.resolve(process.env.DASHBOARD_DIST_DIR);
  }

  return path.resolve(getApiRoot(), '..', 'dashboard', 'dist');
}

function shouldServeDashboard() {
  return parseBoolean(process.env.SERVE_DASHBOARD, false);
}

function getBodyLimit() {
  return process.env.JSON_BODY_LIMIT || '1mb';
}

function getTrustProxy() {
  const rawValue = process.env.TRUST_PROXY;

  if (rawValue === undefined || rawValue === '') {
    return 1;
  }

  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  const parsedNumber = Number(rawValue);
  return Number.isInteger(parsedNumber) ? parsedNumber : rawValue;
}

function getClientRuntimeConfig() {
  return {
    VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN || '',
    VITE_AUTH0_CLIENT_ID: process.env.VITE_AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_ID || '',
    VITE_AUTH0_AUDIENCE: process.env.VITE_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE || '',
    VITE_AUTH0_GITHUB_CONNECTION: process.env.VITE_AUTH0_GITHUB_CONNECTION || 'github',
    VITE_AUTH0_LINEAR_CONNECTION: process.env.VITE_AUTH0_LINEAR_CONNECTION || 'linear',
    VITE_API_URL: process.env.VITE_API_URL || '',
  };
}

function validateRuntime() {
  const issues = [];

  try {
    fs.mkdirSync(getDataDir(), { recursive: true });
    fs.accessSync(getDataDir(), fs.constants.W_OK);
  } catch (error) {
    issues.push(`Data directory is not writable: ${getDataDir()} (${error.message})`);
  }

  if (shouldServeDashboard()) {
    const dashboardIndexPath = path.join(getDashboardDistPath(), 'index.html');
    if (!fs.existsSync(dashboardIndexPath)) {
      issues.push(`SERVE_DASHBOARD=true but no dashboard build was found at ${dashboardIndexPath}`);
    }
  }

  if (isDemoMode()) {
    return issues;
  }

  const requiredEnv = [
    'AUTH0_DOMAIN',
    'AUTH0_AUDIENCE',
    'AUTH0_CLIENT_ID',
    'AUTH0_MGMT_CLIENT_ID',
    'AUTH0_MGMT_CLIENT_SECRET',
  ];

  for (const name of requiredEnv) {
    if (!String(process.env[name] || '').trim()) {
      issues.push(`Missing required environment variable ${name}`);
    }
  }

  if (!normalizeUrl(process.env.FRONTEND_URL) && !normalizeUrl(process.env.API_BASE_URL)) {
    issues.push('Set FRONTEND_URL or API_BASE_URL so invite and approval links resolve correctly');
  }

  if (!getAllowedOrigins().length) {
    issues.push('Set FRONTEND_URL or CORS_ALLOWED_ORIGINS to allow the dashboard origin');
  }

  return issues;
}

function assertValidRuntime() {
  const issues = validateRuntime();

  if (!issues.length) {
    return;
  }

  const error = new Error(`Invalid runtime configuration:\n- ${issues.join('\n- ')}`);
  error.code = 'INVALID_RUNTIME_CONFIG';
  throw error;
}

module.exports = {
  assertValidRuntime,
  getAllowedOrigins,
  getApiBaseUrl,
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
};
