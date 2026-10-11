# Tasks: OAuth connection foundation

- [x] **O1 — Lock provider and redirect contract**
  - Acceptance: fixed allowlisted Gmail/Slack/Airtable definitions, exact callback paths/base-url validation, server-only env names, scopes, provider-appropriate PKCE, one-time state, Strict session-cookie preservation, and callback-only browser binding are explicit.
  - Verify: cross-check current official Google, Slack, Airtable, and OAuth security documentation; review callback and token URLs.

- [x] **O2 — Persist OAuth state and encrypt token bundles**
  - Acceptance: additive migration adds expiring one-time OAuth-state storage and one encrypted OAuth credential per account; state verifier and token bundles are context-bound AES-GCM envelopes.
  - Verify: Drizzle schema generation/check and cryptographic AAD tests.

- [x] **O3 — Implement injectable OAuth lifecycle core**
  - Acceptance: connect start validates origin/session/provider/config and creates bounded state; callback consumes state atomically, verifies cookie and active initiating session/provider/redirect, exchanges code with PKCE where appropriate, saves encrypted owner-scoped accounts; listing returns metadata only; disconnect is owner-scoped; refresh preserves rotating refresh tokens.
  - Verify: fake-provider lifecycle tests cover state, replay, session loss, token exchange, refresh, and disconnect without provider secrets.

- [x] **O4 — Expose Vercel APIs and isolate OAuth credentials**
  - Acceptance: API routes cover account listing, start, callback, and disconnect; AI credential management and resolution never include or delete integration-token rows.
  - Verify: dispatcher/type checks and AI-only credential predicates.

- [ ] **O5 — Connect-app UI and setup guidance**
  - Acceptance: Integrations page shows honest app-configuration status, connection states, connect/disconnect, accessible feedback, and accurate next-step action boundaries.
  - Verify: browser review on local and Vercel Preview; confirm API setup status and keyboard focus.

- [ ] **O6 — Docs, release checks, and review handoff**
  - Acceptance: `.env.example`, architecture, roadmap, and provider setup docs state exact env names, scopes, and callback URLs; full tests/build/schema/diff checks pass; migration/deploy status is explicit.
  - Verify: `npm run lint && npm test && npm run build && npx drizzle-kit check && git diff --check`; inspect full diff; push to existing draft PR branch.
