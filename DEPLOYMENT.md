# Deployment Guide

Vouch is now structured to deploy as a single web service that serves:

- the Express API
- the built React dashboard
- the runtime dashboard config at `/runtime-config.js`

## Recommended Path

Use the included [render.yaml](/Users/anish/Documents/Vouch/render.yaml) Blueprint on Render.

Why this is the recommended hackathon path:

- one service to deploy
- persistent disk support for the JSON-backed stores
- health checks via `/readyz`
- zero extra infra needed for the demo

## Pre-Deploy Checklist

Before deploying, make sure you have:

- an Auth0 tenant
- a SPA application for the dashboard
- an M2M application for the SDK/CLI
- a Management API client with Token Vault access
- GitHub and Linear connections configured in Auth0 Token Vault
- a public base URL for the deployed app

## Required Runtime Values

Set these in your platform environment:

- `NODE_ENV=production`
- `DEMO_MODE=false`
- `SERVE_DASHBOARD=true`
- `PORT=3001`
- `TRUST_PROXY=1`
- `VOUCH_DATA_DIR=/data`
- `API_BASE_URL=https://your-app.example.com`
- `FRONTEND_URL=https://your-app.example.com`
- `CORS_ALLOWED_ORIGINS=https://your-app.example.com`
- `AUTH0_DOMAIN=your-tenant.us.auth0.com`
- `AUTH0_AUDIENCE=https://api.vouch.dev`
- `AUTH0_CLIENT_ID=...`
- `AUTH0_MGMT_CLIENT_ID=...`
- `AUTH0_MGMT_CLIENT_SECRET=...`
- `VITE_API_URL=https://your-app.example.com`
- `VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com`
- `VITE_AUTH0_CLIENT_ID=...`
- `VITE_AUTH0_AUDIENCE=https://api.vouch.dev`

For the CLI after deploy:

- `VOUCH_API_URL=https://your-app.example.com`
- `VOUCH_DELEGATION_ID=<real delegation id>`
- `VOUCH_M2M_CLIENT_ID=...`
- `VOUCH_M2M_CLIENT_SECRET=...`
- `AUTH0_DOMAIN=your-tenant.us.auth0.com`
- `AUTH0_AUDIENCE=https://api.vouch.dev`
- `GROQ_API_KEY=...`
- `DEMO_MODE=false`

## Auth0 App Setup

Your deployed URLs need to be allowed in Auth0 for the flows Vouch uses:

- dashboard callback at `/callback`
- backend connection callback at `/api/auth/callback`
- deployed origin for the dashboard itself

Vouch now validates OAuth `state` on service connection callbacks, so live connections must begin from the dashboard’s connect flow.

## Render Deploy Steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint and point it at the repo.
3. Render will detect [render.yaml](/Users/anish/Documents/Vouch/render.yaml).
4. Fill in the `sync: false` secrets and public URLs.
5. Deploy the service.
6. Wait for `/readyz` to return `200`.
7. Run:

```bash
npm run deploy:check -- https://your-app.example.com
```

## Launch Checklist

Before demoing to judges:

- `npm test` passes
- `npm run build` passes
- deployed `/health` returns `200`
- deployed `/readyz` returns `200`
- dashboard loads over HTTPS
- GitHub and Linear show as connected
- a real delegation exists
- the CLI points at the deployed API
- a step-up action can be approved live from the dashboard

## Important Limits

This repo is ready for a strong hackathon deployment, but not yet a horizontally scaled production system.

Current tradeoffs:

- delegations/audits/connections persist on disk, not in Redis/Postgres
- one-instance deployment is the intended mode
- service connection status is demo-friendly and hackathon-friendly, not a full enterprise OAuth broker

If you want to go beyond hackathon scale, the next milestone is replacing JSON persistence with Postgres or Redis and adding authenticated user sessions around the dashboard.
