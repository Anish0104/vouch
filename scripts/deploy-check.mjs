#!/usr/bin/env node

import { pathToFileURL } from 'url';

const [, , rawBaseUrl] = process.argv;

async function readJson(url) {
  const response = await fetch(url);
  const text = await response.text();

  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

export async function runDeploymentCheck(baseUrl, options = {}) {
  const output = options.output || process.stdout;
  const errorOutput = options.errorOutput || process.stderr;
  const checks = [
    ['health', `${baseUrl}/health`],
    ['readyz', `${baseUrl}/readyz`],
    ['auth status', `${baseUrl}/api/auth/status`],
    ['runtime config', `${baseUrl}/runtime-config.js`],
  ];

  let failed = false;

  for (const [label, url] of checks) {
    try {
      const result = await readJson(url);
      output.write(`\n[${label}] ${result.status}\n`);
      output.write(`${typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}\n`);

      if (label === 'readyz' && (!result.ok || result.body?.status !== 'ready')) {
        failed = true;
      }

      if (label !== 'readyz' && !result.ok) {
        failed = true;
      }
    } catch (error) {
      failed = true;
      output.write(`\n[${label}] FAILED\n${error.message}\n`);
    }
  }

  if (failed) {
    errorOutput.write('\nDeployment check failed.\n');
    return false;
  }

  output.write('\nDeployment check passed.\n');
  return true;
}

export async function main(baseUrlArg = rawBaseUrl) {
  if (!baseUrlArg) {
    process.stderr.write('Usage: npm run deploy:check -- https://your-app.example.com\n');
    process.exit(1);
  }

  const baseUrl = baseUrlArg.replace(/\/+$/, '');
  const passed = await runDeploymentCheck(baseUrl);
  process.exit(passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
