# Vouch

**Tagline:** "Cursor is in your codebase. Do you know what it can do?"

Vouch is a trust layer for AI agent authorization. It allows coding agents to perform scoped actions on GitHub/Linear without ever receiving a raw user credential.

For the Auth0 "Authorized to Act" hackathon (April 2026), Vouch demonstrates:

- Policy-as-code via `.vouch.yml`
- Agent auth via Auth0 M2M
- Human step-up approval for sensitive actions
- Real-time audit logs over SSE
- Token Vault-backed service execution where the agent never gets OAuth tokens

## Core Idea

The security boundary is `Token Vault + policy enforcement`:

1. Agent requests an action through `POST /api/agent/action`
2. API verifies M2M identity and delegation policy
3. Denied actions are blocked and logged
4. Step-up actions wait for human approval
5. Allowed actions execute using Token Vault-backed credentials
6. Results return to the agent and are streamed to dashboard audit logs

## Monorepo Structure

```text
vouch/
├── apps/
│   ├── api/         # Express Vouch API
│   └── dashboard/   # React dashboard
├── packages/
│   └── vouch-sdk/   # Agent SDK + CLI
├── .vouch.yml       # Example policy
├── .env.example     # Combined env example
└── README.md
```

## Tech Stack

- Frontend: React 18, Vite 5, Tailwind CSS 3, Framer Motion 11
- Backend: Node.js, Express 4, Auth0 SDK, Octokit, js-yaml
- Agent SDK/CLI: Node.js, Groq SDK, Axios, js-yaml
- Auth: Auth0 SPA + M2M + Token Vault + step-up workflows

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 1.5) Run the verification suite

```bash
npm test
```

### 2) Configure environment

Copy values from `.env.example` into your local environment as needed for:

- API (`AUTH0_*`, `PORT`, `FRONTEND_URL`, `API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `DEMO_MODE`, `SERVE_DASHBOARD`, `VOUCH_DATA_DIR`)
- API (`AUTH0_*`, `HOST`, `PORT`, `FRONTEND_URL`, `API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `DEMO_MODE`, `SERVE_DASHBOARD`, `VOUCH_DATA_DIR`)
- Dashboard (`VITE_*`)
- Dashboard (`VITE_*`, optional `VITE_AUTH0_GITHUB_CONNECTION`, `VITE_AUTH0_LINEAR_CONNECTION`)
- CLI/SDK (`VOUCH_*`, `GROQ_API_KEY`)

For live Token Vault execution, also configure:

- `AUTH0_TOKEN_VAULT_CLIENT_ID`
- `AUTH0_TOKEN_VAULT_CLIENT_SECRET`
- `AUTH0_TOKEN_VAULT_PRIVATE_KEY`
- `AUTH0_TOKEN_VAULT_KEY_ID` (optional)

### 3) Run API + dashboard

```bash
npm run dev
```

This starts:

- API on `http://localhost:3001`
- Dashboard on `http://localhost:5173`

### 4) Run CLI agent

```bash
npm run run-agent --workspace=packages/vouch-sdk -- run "create a branch called feature/test"
```

### 5) Check runtime readiness

```bash
curl http://localhost:3001/readyz
```

`/health` reports liveness. `/readyz` reports missing production config such as Auth0 or public URL settings.

## Environment Modes

- `DEMO_MODE=true`:
  - Skips live Auth0 verification and live Token Vault calls
  - Uses demo identities/tokens and mock service responses
  - Enables fast local demos
- `DEMO_MODE=false`:
  - Expects real Auth0 + OAuth + Token Vault configuration

## Production Deployment

Vouch can now ship as a single service:

1. Build the dashboard

```bash
npm run build
```

2. Start the API in live mode

```bash
npm start
```

3. Or build and run the containerized deployment

```bash
docker compose up --build
```

Production-specific notes:

- Set `API_BASE_URL` to the public HTTPS URL of the API so OAuth callbacks resolve correctly behind proxies/load balancers.
- Set `FRONTEND_URL` to the public dashboard URL. For the single-container deployment, this is usually the same value as `API_BASE_URL`.
- Set `CORS_ALLOWED_ORIGINS` to the dashboard origin if the dashboard is hosted separately.
- Set `SERVE_DASHBOARD=true` to serve the built React app from the API process.
- The dashboard reads public Auth0/API settings from `/runtime-config.js`, so the same built frontend can be configured at runtime inside the container.
- `/readyz` returns `503` until the required live Auth0 configuration is present.
- Live service connection now uses Auth0 Connected Accounts via the My Account API. Your Auth0 SPA must be allowed to request Connected Accounts scopes, and your connection names must match `VITE_AUTH0_GITHUB_CONNECTION` / `VITE_AUTH0_LINEAR_CONNECTION`.
- Live Token Vault execution now uses a privileged worker token exchange, so the API also needs `AUTH0_TOKEN_VAULT_CLIENT_ID`, `AUTH0_TOKEN_VAULT_CLIENT_SECRET`, and `AUTH0_TOKEN_VAULT_PRIVATE_KEY`.
- Live dashboard mutation and approval routes now require an end-user Auth0 access token, so policy saves, invite generation, audit reads, and step-up approvals are scoped to the signed-in user.
- Linear issue creation can now discover workspace teams through `linear.listTeams`, and `linear.createIssue` accepts `teamId`, `teamKey`, or `teamName` so the agent does not need a raw team UUID up front.
- Render Blueprint deployment is included in [render.yaml](/Users/anish/Documents/Vouch/render.yaml).
- CI is included in [.github/workflows/ci.yml](/Users/anish/Documents/Vouch/.github/workflows/ci.yml).
- A post-deploy smoke check is included via `npm run deploy:check -- https://your-app.example.com`.
- The full deployment checklist is in [DEPLOYMENT.md](/Users/anish/Documents/Vouch/DEPLOYMENT.md).
- The Linear/Auth0 setup walkthrough is in [LINEAR_SETUP.md](/Users/anish/Documents/Vouch/LINEAR_SETUP.md).

## API Surface

### Delegation

- `POST /api/delegate`
  - Create a delegation with allow/deny/step-up policy
- `GET /api/delegate`
  - List active delegations
- `GET /api/delegate/:id`
  - Read one delegation
- `GET /api/delegate/invite/:token`
  - Resolve invite token to delegation metadata

### Agent Actions

- `POST /api/agent/action`
  - Main action execution endpoint
  - Requires `Authorization: Bearer <m2m token>`
  - Requires `X-Vouch-Delegation: <delegation id>`
- `GET /api/agent/pending`
  - List pending step-up actions

### Audit + Approval

- `GET /api/audit`
  - Query audit events (`limit`, `status`, `agent`, `auditId`, `delegationId`)
- `GET /api/audit/stream`
  - SSE stream of live audit actions
- `GET /api/audit/sessions`
  - Aggregated active sessions
- `GET /api/audit/pending`
  - Pending approval queue
- `POST /api/audit/approve/:auditId`
  - Approve pending action
- `POST /api/audit/reject/:auditId`
  - Reject pending action

Compatibility aliases also exist:

- `POST /api/approve/:auditId`
- `POST /api/reject/:auditId`

## Policy-as-Code (`.vouch.yml`)

Example:

```yaml
agent: cursor
expires: 48h
allow:
  - github.createBranch
  - github.readCode
  - github.openPR
deny:
  - github.mergeToMain
  - github.accessSecrets
step_up_required:
  - github.openPR
  - github.pushCode
```

Enforcement order:

1. Deny list
2. Allow list
3. Step-up requirement

## Demo Flow (3-minute script)

1. Connect GitHub/Linear in dashboard
2. Save delegation policy from Policy page
3. Generate invite from Dashboard
4. Run CLI task through Vouch SDK
5. Watch live audit stream events
6. Approve step-up action in modal
7. Show blocked denied action

## Notes

- Delegations, approvals, audit events, and connection status now persist to JSON files in `VOUCH_DATA_DIR` (default: `.vouch-data`).
- The repo is deployment-ready for a single-instance environment. For production scale or HA, replace the JSON-backed stores with Redis/Postgres.
- `github.createCommit` now creates a real Git commit via the GitHub Git Data APIs, and `github.pushCode` advances the branch ref in a separate step-up action.
- The API can serve the built dashboard directly, and includes `/health` and `/readyz` endpoints for platform health checks.
