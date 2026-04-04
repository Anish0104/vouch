const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

const SCRIPT_URL = pathToFileURL(path.join(__dirname, '..', 'scripts', 'deploy-check.mjs')).href;

test('runDeploymentCheck passes when the deployed service endpoints are healthy', async () => {
  const { runDeploymentCheck } = await import(SCRIPT_URL);

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', demo: false }));
      return;
    }

    if (req.url === '/readyz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready', issues: [] }));
      return;
    }

    if (req.url === '/api/auth/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false, services: { github: false, linear: false } }));
      return;
    }

    if (req.url === '/runtime-config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('window.__VOUCH_CONFIG__ = Object.freeze({});\n');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const output = [];

  try {
    const passed = await runDeploymentCheck(`http://127.0.0.1:${port}`, {
      output: { write: (message) => output.push(message) },
      errorOutput: { write: (message) => output.push(message) },
    });

    assert.equal(passed, true);
    assert.match(output.join(''), /Deployment check passed/);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
