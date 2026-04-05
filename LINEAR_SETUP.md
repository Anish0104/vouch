# Linear Setup Guide

This guide covers the remaining setup outside the codebase so Vouch can use Linear as a real Connected Account through Auth0 Token Vault.

## What Vouch Now Supports

The codebase is already prepared for the product flow:

- `linear.listTeams` is available in the API and agent SDK
- `linear.createIssue` can resolve a team by `teamId`, `teamKey`, or `teamName`
- policy defaults now include Linear team discovery
- the dashboard already requests the Connected Accounts scopes needed for Linear

What is still external is the Auth0 + Linear OAuth configuration.

## 1. Create a Linear OAuth App

In Linear:

1. Open the developer settings for your Linear workspace.
2. Create a new OAuth application.
3. Set the redirect URL to:

```text
https://YOUR_AUTH0_DOMAIN/login/callback
```

4. Save the Linear `client_id` and `client_secret`.

Use these provider scopes for Vouch:

```text
read
write
issues:create
```

## 2. Create the Auth0 Custom Social Connection

In Auth0:

1. Go to `Authentication` -> `Social Connections`.
2. Click `Create Connection`.
3. Scroll to the bottom and choose `Create Custom`.
4. Name the connection:

```text
linear
```

5. Use these OAuth endpoints:

```text
Authorization URL: https://linear.app/oauth/authorize
Token URL: https://api.linear.app/oauth/token
```

6. Paste the Linear `client_id` and `client_secret`.
7. Keep the callback URL as:

```text
https://YOUR_AUTH0_DOMAIN/login/callback
```

## 3. Add the Fetch User Profile Script

Auth0 custom social connections need a fetch-profile script. Use this in the Linear connection:

```js
function fetchUserProfile(accessToken, context, callback) {
  request.post(
    {
      url: 'https://api.linear.app/graphql',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: '{ viewer { id name email } }'
      })
    },
    function (err, resp, body) {
      if (err) return callback(err);
      if (resp.statusCode !== 200) return callback(new Error(body));

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        return callback(new Error(body));
      }

      const viewer = parsed && parsed.data && parsed.data.viewer;
      if (!viewer || !viewer.id) {
        return callback(new Error('Linear viewer profile missing id'));
      }

      callback(null, {
        user_id: viewer.id,
        name: viewer.name || undefined,
        email: viewer.email || undefined
      });
    }
  );
}
```

## 4. Enable Connected Accounts for Token Vault

Still in the Auth0 Linear connection:

1. Turn on `Connected Accounts for Token Vault`.
2. If Auth0 prompts for it, enable `offline_access`.
3. Make sure the connection is enabled for your Vouch SPA application.

## 5. Configure Auth0 My Account API

In Auth0:

1. Go to `Applications` -> `APIs`.
2. Activate `Auth0 My Account API`.
3. Open the application access settings for your SPA.
4. Authorize the SPA.
5. Grant these scopes:

```text
create:me:connected_accounts
read:me:connected_accounts
delete:me:connected_accounts
```

6. Enable My Account API under Multi-Resource Refresh Token for the SPA.

## 6. Set the Runtime Environment

Make sure your local or deployed environment includes:

```text
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.vouch.dev
AUTH0_CLIENT_ID=...
AUTH0_MGMT_CLIENT_ID=...
AUTH0_MGMT_CLIENT_SECRET=...
AUTH0_TOKEN_VAULT_CLIENT_ID=...
AUTH0_TOKEN_VAULT_CLIENT_SECRET=...
AUTH0_TOKEN_VAULT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=...
VITE_AUTH0_AUDIENCE=https://api.vouch.dev
VITE_AUTH0_LINEAR_CONNECTION=linear
```

If your Auth0 connection is named something else, set `VITE_AUTH0_LINEAR_CONNECTION` to that exact name.

## 7. Restart and Connect Linear

From the repo root:

```bash
npm run dev
```

Then:

1. Sign into Vouch.
2. Open `/connect`.
3. Click `Connect` on the Linear card.
4. Complete the Auth0-hosted Connected Accounts flow.

## 8. Verify the Setup

Check the live preflight:

```bash
curl -sS http://localhost:3001/api/auth/preflight
```

You want to see:

- the SPA client found
- the My Account grant found
- the Linear connection found
- no missing callback/origin issues

Then test the agent path with a safe read first:

```bash
npm run run-agent --workspace=packages/vouch-sdk -- run "list Linear teams"
```

After that, test issue creation:

```bash
npm run run-agent --workspace=packages/vouch-sdk -- run "create a Linear issue titled 'Vouch production hardening' for team ENG"
```

## 9. Troubleshooting

- `Missing refresh token`
  - The Auth0 connection is not returning offline access. Re-check Connected Accounts and `offline_access`.
- `Could not find a Linear team matching ...`
  - Run `linear.listTeams` first and use a real team key like `ENG`.
- `403` or `404` from My Account API
  - The SPA is missing the Connected Accounts client grant or My Account API is not activated.
- `Connection not found`
  - `VITE_AUTH0_LINEAR_CONNECTION` does not match the Auth0 connection name.

## Official References

- Auth0 Connected Accounts for Token Vault: https://auth0.com/docs/secure/tokens/token-vault/connected-accounts-for-token-vault
- Auth0 My Account API: https://auth0.com/docs/manage-users/my-account-api
- Auth0 custom OAuth2 social connections: https://auth0.com/docs/authenticate/identity-providers/social-identity-providers/oauth2
- Linear OAuth 2.0: https://linear.app/developers/oauth-2-0-authentication
- Linear GraphQL getting started: https://linear.app/developers/graphql
