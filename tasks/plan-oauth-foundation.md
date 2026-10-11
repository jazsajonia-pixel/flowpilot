# Plan: OAuth connection foundation

## Outcome
Add a production-oriented OAuth 2.0 authorization-code foundation for Google/Gmail, Slack, and Airtable, including connected-account management UI, one-time browser-bound state, provider-appropriate S256 PKCE, encrypted token storage, safe disconnect, refresh handling, and a testable provider boundary. Keep operation-specific Gmail/Slack/Airtable workflow actions outside this foundation slice; the integration page must state the boundary honestly.

## Existing project baseline
- Branch: `feat/flowpilot-builder-ui-refresh` (PR #39 draft); preserve its UI work.
- Vercel is the deployment target. `https://flowpilot-sage-delta.vercel.app` is the verified production domain; Vercel also lists the `flowpilot-chrono8.vercel.app` alias, currently used by `APP_URL`, but OAuth will use the verified production domain explicitly.
- Existing `integrations` records already hold owner/provider/name/status/non-secret settings.
- Existing `credentials` records already support encrypted payloads linked by `(integration_id, owner_id)`.
- Existing AI credential routes must be constrained to AI-provider rows with `integration_id IS NULL` before OAuth credentials are introduced.
- Add only the missing one-time OAuth-state persistence table and a one-per-integration credential uniqueness constraint; do not duplicate the existing account/credential model.

## Product and visual direction
Retain the refreshed FlowPilot identity and interaction patterns. The Integrations view gains a connected-app panel with provider-specific setup readiness, connected-account status, Connect/Disconnect actions, loading/empty/error/success states, and accessible focus/hover transitions. It must not claim an account is connected without a persisted account. It must say that native provider workflow actions are not part of this foundation slice.

## Security and behavior decisions
1. Use only authorization-code flow; no implicit or token-in-URL grants.
2. Use distinct callback paths per provider (mix-up defense), an exact configured HTTPS public base URL, random state whose SHA-256 digest is stored, 10-minute expiry, and atomic state consumption before token exchange.
3. Preserve the existing `fp_session` cookie's `SameSite=Strict` policy. At connect initiation set a separate random HttpOnly callback-only `SameSite=Lax` cookie (also Secure on HTTPS), scoped to the provider callback; store only its digest with state. The state row also stores the initiating session token hash and owner. On callback, verify the browser-binding digest and that the original server-side session is still active before exchanging the code.
4. Generate fresh S256 PKCE material for providers that support/require it (Google and Airtable); encrypt the verifier at rest. Slack PKCE is optional but enabling it is an effectively one-way public-client app setting, so keep it disabled by default and use one-time state plus the confidential client secret. Enable only if the app owner explicitly opts in.
5. Keep client IDs/secrets server-only; expose only provider label/configured boolean. Provider IDs are an allowlist. Never accept authorization, token, API, or callback URLs from users.
6. Encrypt access/refresh-token bundles with AES-256-GCM under `CREDENTIAL_ENCRYPTION_KEY`, binding AAD to owner, integration, credential, and provider. Store only ciphertext in `credentials.encrypted_payload`; keep `integrations.settings` strictly non-secret.
7. Callback must match the original state, browser cookie, still-active initiating session, provider, and stored exact redirect URI. Redirect back only to the configured app origin. Treat provider error parameters as opaque.
8. Refresh tokens only server-side, validate token response fields and sizes, use fixed provider endpoints and bounded timeouts, preserve an existing refresh token when a provider omits a replacement, and avoid logging response bodies/secrets.
9. Disconnect is owner-scoped and deletes local token material even if provider revocation is unavailable; report local-disconnect success without claiming remote revocation.
10. Keep OAuth credentials out of AI credential listings/deletion/quota and AI-provider resolution.
11. No new app secrets will be generated or set on the user's behalf. The user will register provider apps and configure IDs/secrets later; return exact variable names, scopes, and callback URLs.

## Provider setup contract
- Required callback-base variable: `OAUTH_REDIRECT_BASE_URL` (HTTPS origin; localhost HTTP allowed only in development).
- Server-only provider variables: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET`, `AIRTABLE_OAUTH_CLIENT_ID`, `AIRTABLE_OAUTH_CLIENT_SECRET` (Airtable secret is optional per provider documentation).
- Production base is currently `https://flowpilot-sage-delta.vercel.app`.
- Exact callback pattern: `<OAUTH_REDIRECT_BASE_URL>/api/integrations/oauth/<provider>/callback`.
- Provider authorization/token endpoints and scopes are fixed in code and cross-checked against official documentation. The UI never exposes a Connect action unless the complete server configuration for that provider is present.

## Implementation phases
A. Add provider configuration, shared OAuth types, encrypted token/verifier vault, state schema, and SQL migration.
B. Add an injectable OAuth core for start/callback/list/disconnect/refresh; validate state/session/provider, constrain network requests, and keep responses generic.
C. Add Vercel API handlers and route wiring, using existing integration/credential tables and owner predicates.
D. Constrain AI credential APIs and resolver to AI-only non-integration credentials.
E. Add typed client helpers and integrate connection UI into `/integrations`; show accurate unavailable/setup states until server environment is complete.
F. Add tests for crypto AAD, PKCE/state/browser/session/provider binding, replay/expiry, token exchange/refresh, provider revocation behavior, API method/origin behavior, and AI/OAuth credential isolation.
G. Update `.env.example`, architecture/roadmap/integration docs, then run full checks, browser review, PR preview smoke tests, and inspect the final diff.

## Acceptance and boundary
- App client secrets never enter Vite/browser output, logs, API responses, or database plaintext.
- A mocked full authorization lifecycle passes tests; real Gmail/Slack/Airtable authorization cannot be end-to-end verified until the user registers provider apps and supplies IDs/secrets.
- OAuth account metadata is owner-scoped; disconnect and refresh behavior are covered by tests; no production migration, merge, or production redeploy occurs until the new schema and configured OAuth preview are proven.
- Existing builder, drag/drop, execution animation, and workflow behavior remain unchanged.

## Verification
`npm run lint && npm test && npm run build && npx drizzle-kit check && git diff --check`
