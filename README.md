# Vouch

Vouch is a trust layer for AI agent authorization. It lets an agent act on GitHub and Linear through scoped delegations, human approval, and Auth0 Token Vault so the agent never receives raw user credentials.

Current live deployment: `https://vouch-q017.onrender.com`

## Why Vouch

AI coding agents are useful, but "just give the agent your token" is not a security model.

Vouch adds a control plane between the agent and your tools:

- policy-as-code in `.vouch.yml`
- Auth0-backed machine identity for the agent
- per-action allow, deny, and step-up rules
- live audit logs and approval workflows
- GitHub and Linear execution through Token Vault-backed credentials

## What It Demonstrates

For the Auth0 "Authorized to Act" hackathon, Vouch shows:

- an agent requesting actions through a policy gateway
- a human approving sensitive operations in real time
- secure connected-account execution without leaking OAuth tokens to the agent
- a single deployed dashboard/API service that is easy to demo live

## How It Works

1. An agent sends an action request to `POST /api/agent/action`.
2. The API authenticates the agent with Auth0 M2M.
3. Vouch evaluates the request against the active delegation policy.
4. Allowed actions execute immediately through connected accounts and Token Vault.
5. Step-up actions wait for a human approval in the dashboard.
6. Every action is streamed into the audit log.

## Architecture

```text
Agent CLI / SDK
      |
      v
  Vouch API  -----> Policy evaluation (.vouch.yml + delegation rules)
      |
      +-----> Auth0 M2M / SPA auth / Connected Accounts / Token Vault
      |
      +-----> GitHub + Linear actions
      |
      +-----> Dashboard audit stream + approval UI
```

## Monorepo Layout

```text
vouch/
├── apps/
│   ├── api/              # Express API and runtime config
│   └── dashboard/        # React dashboard
├── packages/
│   └── vouch-sdk/        # Agent SDK + CLI
├── .vouch.yml            # Policy-as-code example
├── render.yaml           # Render Blueprint
├── DEPLOYMENT.md         # Full deployment checklist
├── LINEAR_SETUP.md       # Auth0 + Linear setup notes
└── README.md
```

## Tech Stack

- Frontend: React 18, Vite 5, Tailwind CSS, Framer Motion
- Backend: Node.js, Express 4
- Auth: Auth0 SPA, Auth0 M2M, Auth0 Token Vault, Connected Accounts
- Integrations: GitHub, Linear
- Agent runtime: Node.js CLI, Groq SDK, Axios

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` into the env files you need for local work:

- `apps/api/.env` for API/runtime settings
- `apps/dashboard/.env` for public dashboard settings
- `packages/vouch-sdk/.env` for CLI/SDK settings

Core groups you will need:

- API: `AUTH0_*`, `HOST`, `PORT`, `FRONTEND_URL`, `API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `SERVE_DASHBOARD`, `VOUCH_DATA_DIR`, `DEMO_MODE`
- Dashboard: `VITE_AUTH0_*`, `VITE_API_URL`
- SDK/CLI: `VOUCH_API_URL`, `VOUCH_DELEGATION_ID`, `VOUCH_M2M_CLIENT_ID`, `VOUCH_M2M_CLIENT_SECRET`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `GROQ_API_KEY`

For live Token Vault execution you also need:

- `AUTH0_TOKEN_VAULT_CLIENT_ID`
- `AUTH0_TOKEN_VAULT_CLIENT_SECRET`
- `AUTH0_TOKEN_VAULT_PRIVATE_KEY`
- `AUTH0_TOKEN_VAULT_KEY_ID` (optional)

### 3. Run tests

```bash
npm test
```

### 4. Start the app locally

```bash
npm run dev
```

This starts:

- API at `http://localhost:3001`
- Dashboard at `http://localhost:5173`

### 5. Check readiness

```bash
curl http://localhost:3001/health
curl http://localhost:3001/readyz
```

`/health` is liveness. `/readyz` checks whether the runtime config is complete enough for live mode.

## Demo Modes

- `DEMO_MODE=true`
  - uses mock identities and mock tool execution
  - good for fast local demos without live Auth0 flows
- `DEMO_MODE=false`
  - requires real Auth0 and connected-account configuration
  - used for deployed/live demos

## Running the Agent CLI

From the repo root:

```bash
npm run run-agent --workspace=packages/vouch-sdk -- run "create a branch called feature/test-vouch"
```

The SDK reads:

- `VOUCH_API_URL` for the target Vouch API
- `VOUCH_DELEGATION_ID` for the active delegation
- `VOUCH_M2M_CLIENT_ID` and `VOUCH_M2M_CLIENT_SECRET` to mint the agent token

If you run the CLI from this repo checkout, it can auto-detect the default GitHub repo from `git remote origin`.

## Live Demo Flow

### Dashboard

1. Open `https://vouch-q017.onrender.com`
2. Sign in with Auth0
3. Connect GitHub and Linear on the `Connect` tab
4. Click `Run Demo Scenario` on the dashboard
5. Copy the generated delegation id and suggested task

### CLI

Point the SDK at the deployed service and use the new delegation:

```bash
export VOUCH_API_URL=https://vouch-q017.onrender.com
export VOUCH_DELEGATION_ID=<real-delegation-id>
npm run run-agent --workspace=packages/vouch-sdk -- run "create a branch called feature/final-demo"
```

Expected result:

- the agent creates a branch through Vouch
- the audit log updates in real time
- the branch appears in GitHub

To test a step-up flow:

```bash
npm run run-agent --workspace=packages/vouch-sdk -- run "open a pull request from feature/final-demo to main titled Final demo PR"
```

Then approve the pending action from the dashboard.

## Deployment

Vouch is designed to deploy as a single web service that serves:

- the Express API
- the built React dashboard
- runtime dashboard config at `/runtime-config.js`

Recommended path:

- use the included [render.yaml](render.yaml) Blueprint on Render
- fill in the `sync: false` environment variables in Render
- configure Auth0 callback, web origin, logout, and CORS URLs
- deploy and wait for `/readyz` to return `200`

Smoke-check a deployment with:

```bash
npm run deploy:check -- https://vouch-q017.onrender.com
```

For the full checklist, see [DEPLOYMENT.md](DEPLOYMENT.md).

For Auth0 + Linear setup details, see [LINEAR_SETUP.md](LINEAR_SETUP.md).

## Production Runtime Notes

- `API_BASE_URL` should be the public HTTPS URL of the deployed app
- `FRONTEND_URL` should be the public dashboard URL
- `CORS_ALLOWED_ORIGINS` should include the dashboard origin
- `SERVE_DASHBOARD=true` serves the built frontend from the API process
- `/readyz` returns `503` until required live Auth0 settings are present
- live dashboard writes and approvals require a signed-in end-user access token

## Example Policy

```yaml
agent: cursor
expires: 48h

allow:
  - github.createBranch
  - github.readCode
  - github.listCommits
  - github.openPR

deny:
  - github.mergeToMain
  - github.accessSecrets

step_up_required:
  - github.openPR
  - github.pushCode
```

Enforcement order:

1. deny list
2. allow list
3. step-up requirement

## API Overview

### Delegation

- `POST /api/delegate`
- `GET /api/delegate`
- `GET /api/delegate/:id`
- `GET /api/delegate/invite/:token`

### Agent Actions

- `POST /api/agent/action`
- `GET /api/agent/pending`

### Audit and Approval

- `GET /api/audit`
- `GET /api/audit/stream`
- `GET /api/audit/sessions`
- `GET /api/audit/pending`
- `POST /api/audit/approve/:auditId`
- `POST /api/audit/reject/:auditId`

Compatibility aliases also exist:

- `POST /api/approve/:auditId`
- `POST /api/reject/:auditId`

## Current Limits

This repo is intentionally optimized for a strong single-instance demo deployment, not horizontal scale.

Current tradeoffs:

- state is persisted to JSON files, not Postgres or Redis
- one-instance deployment is the intended mode
- audit fanout and persistence are demo-grade rather than HA production-grade

The next major milestone beyond the hackathon path would be replacing JSON-backed stores with infrastructure designed for multi-instance deployments.
