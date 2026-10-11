# OAuth provider setup for FlowPilot

This guide configures the **account-connection foundation** for Gmail, Slack, and Airtable. It does not enable provider workflow actions: Gmail sending, Slack posting, Airtable record operations, resource selection, and output mapping remain a separate feature release. Do not rely on a connected account for automation steps until those actions are implemented and tested.

## Production origin and exact callback URLs

The repository-linked FlowPilot production origin is:

```text
https://flowpilot-sage-delta.vercel.app
```

Set this server-side Vercel environment variable for Production:

```text
OAUTH_REDIRECT_BASE_URL=https://flowpilot-sage-delta.vercel.app
```

Register each callback below **exactly** in its provider app. The path, scheme, hostname, and absence of a trailing slash must match.

| Provider | Authorized redirect / callback URL |
|---|---|
| Gmail / Google | `https://flowpilot-sage-delta.vercel.app/api/integrations/oauth/gmail/callback` |
| Slack | `https://flowpilot-sage-delta.vercel.app/api/integrations/oauth/slack/callback` |
| Airtable | `https://flowpilot-sage-delta.vercel.app/api/integrations/oauth/airtable/callback` |

Do not copy temporary Vercel Preview URLs into production app configuration. To authorize from a Preview, register that exact Preview callback separately, use its matching `OAUTH_REDIRECT_BASE_URL` only in the Preview environment, and remove it when no longer needed.

## Server-only Vercel environment variables

Add the following under Vercel **Project Settings → Environment Variables**. Select the target environment deliberately. Never add a `VITE_` prefix, commit secret values, or send client secrets through chat.

| Variable | Required? | Source / meaning |
|---|---:|---|
| `OAUTH_REDIRECT_BASE_URL` | Yes | Exact HTTPS origin above; same value used to construct the registered callback URLs. |
| `GMAIL_OAUTH_CLIENT_ID` | Yes | Google Cloud OAuth 2.0 Client ID for a **Web application** client. |
| `GMAIL_OAUTH_CLIENT_SECRET` | Yes | The corresponding Google Cloud Web application client secret. |
| `SLACK_OAUTH_CLIENT_ID` | Yes | Slack app's Client ID. |
| `SLACK_OAUTH_CLIENT_SECRET` | Yes | Slack app's Client Secret. |
| `SLACK_OAUTH_PKCE_ENABLED` | No | Omit or set `false` for the recommended confidential-client flow. Set `true` only if the Slack app was deliberately configured as a PKCE public client. |
| `AIRTABLE_OAUTH_CLIENT_ID` | Yes | Airtable OAuth integration's client ID. |
| `AIRTABLE_OAUTH_CLIENT_SECRET` | Optional | Airtable integration secret when configured as a confidential client; omit only when the integration is configured as a public client. |

The `CREDENTIAL_ENCRYPTION_KEY` must already be set and stable for the database environment. It encrypts OAuth state verifiers and OAuth access/refresh token bundles. **Do not rotate or replace it casually**: stored ciphertext cannot be decrypted by a different key.

Before turning on any provider credentials, apply migration `0005_oauth_state` to both `flowpilot-staging` (Preview) and `flowpilot-production` (Production) Neon databases. It adds the short-lived OAuth-state table and changes the nullable `credentials.integration_id` index to unique; inspect for duplicate non-null integration links before applying to a populated database. The provider Connect controls stay disabled until the required provider settings and redirect base are present.

## Google Cloud: Gmail

1. In Google Cloud Console, select the project and enable the **Gmail API**.
2. Configure the OAuth consent screen and create an OAuth Client ID of type **Web application**.
3. Add the Gmail callback URL from the table above under **Authorized redirect URIs** (not only JavaScript origins).
4. Add the ID and secret as `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` in Vercel.
5. The requested scopes are `openid`, `email`, and `https://www.googleapis.com/auth/gmail.send`. The last scope permits sending mail from the authorizing account. Google consent-screen publication and verification requirements depend on the app audience and configured scopes; complete Google's current verification requirements before inviting external users.

FlowPilot requests offline access so the server can refresh account tokens without exposing them to the browser. Google token revocation is attempted on disconnect; the UI reports whether the provider confirmed it.

Official references: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), and [Gmail API setup](https://developers.google.com/workspace/gmail/api/quickstart).

## Slack

1. Create a Slack app in the Slack API dashboard.
2. Under **OAuth & Permissions**, add the Slack callback URL from the table above to **Redirect URLs**.
3. Add these **Bot Token Scopes**: `channels:read` and `chat:write`.
4. Install the app to a test workspace and add `SLACK_OAUTH_CLIENT_ID` plus `SLACK_OAUTH_CLIENT_SECRET` to Vercel.
5. Leave `SLACK_OAUTH_PKCE_ENABLED` unset or `false` for the recommended confidential-client configuration. Slack documents PKCE as optional and one-way for an app; setting it to `true` changes the credential model and requires matching app configuration.

`chat:write` allows the bot to post messages. `channels:read` supports future channel selection; this foundation does **not** yet discover channels or post messages. Slack's `auth.revoke` API is called on disconnect; confirmation is shown only when Slack returns both `ok: true` and `revoked: true`.

Official references: [Slack OAuth installation](https://docs.slack.dev/authentication/installing-with-oauth), [Slack PKCE](https://docs.slack.dev/authentication/using-pkce), and [Slack token revocation](https://docs.slack.dev/reference/methods/auth.revoke/).

## Airtable

1. Create an OAuth integration in Airtable's developer portal.
2. Add the Airtable callback URL from the table above as its redirect URI.
3. Enable the scopes `data.records:read`, `data.records:write`, and `schema.bases:read`.
4. Configure `AIRTABLE_OAUTH_CLIENT_ID` in Vercel and add `AIRTABLE_OAUTH_CLIENT_SECRET` if the integration uses a confidential client.

These scopes permit reading and writing records and reading base schema; the OAuth foundation does **not** yet discover bases/tables or execute record actions. Airtable refresh tokens rotate and invalidate the previous access and refresh tokens, so FlowPilot replaces encrypted tokens atomically. Airtable's OAuth reference currently documents no token-revocation endpoint. Disconnect deletes FlowPilot's local encrypted credentials, but the user must also revoke the OAuth authorization through Airtable's connected-app/integration settings to revoke access at Airtable.

Official references: [Airtable OAuth guide](https://www.airtable.com/developers/web/guides/oauth-integrations), [Airtable OAuth reference](https://airtable.com/developers/web/api/oauth-reference), and [Airtable OAuth example](https://github.com/Airtable/oauth-example).

## Safe enablement sequence

1. Register each provider app and verify its callback URL and scopes.
2. Apply the database migration to both Neon targets; first check the duplicate-link precondition noted above.
3. Add only the provider credentials you are ready to test under Vercel's server-side Production/Preview environment settings.
4. Deploy, open **Integrations**, and connect a test account/workspace. Verify its safe status/name only; tokens never appear in the browser response.
5. Disconnect the test account and verify local deletion plus the provider's revocation result.
6. Do not use these connected accounts in workflow graphs yet; provider actions and field mapping are not included in this foundation.
