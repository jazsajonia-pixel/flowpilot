# FlowPilot AI — Full Development Phases and Future Updates

This is the **authoritative product roadmap** for FlowPilot. Update phase status only after checking the current implementation, tests, deployment, and provider requirements. For the operating rules used by the autonomous developer and scheduled task, see [`autonomous-development-prompt.md`](autonomous-development-prompt.md).

**Product vision:** FlowPilot is a Make.com-like visual automation platform. Users drag modules onto a canvas, connect them, map data between steps, and run automations across native app connectors, AI, logic, APIs, webhooks, and schedules.

## Current status snapshot

**Last verified:** 2026-10-10. **Current milestone:** Phase 8 — Execution Monitoring, Logs & Reliability (**in progress**). The last runtime-changing revision is `614fdb8` (PR #33); its Vercel production deployment and read-only frontend, liveness, and Neon health checks succeeded. PRs #34 and #35 were documentation-only and made no runtime changes.

| Area | Verified status and known limit |
|---|---|
| Platform | Vercel Node 22 dispatcher/serverless API + Vite frontend, Neon PostgreSQL, and Drizzle. Preserve the existing dispatcher architecture. |
| Legacy runtime artifacts | Netlify-named functions and migration paths remain in the repository. They are legacy/compatibility artifacts; do not remove them without proving they are unused and safe to remove. |
| Production domain | `https://flowpilot-sage-delta.vercel.app` is the repository-linked FlowPilot deployment. The requested `https://flowpilot-app.vercel.app` still serves the legacy “FlowPilot AI | Smart Task Extraction” site. The connected Vercel account could not assign the alias because it is owned or controlled elsewhere; never bypass verification. |
| Visual builder | React Flow canvas, graph editing, validation, and workflow persistence are implemented. Continue testing the actual saved-and-run path, not just canvas rendering. |
| Execution | Manual, webhook, and scheduled runs; conditions/filters; HTTP/webhook actions; AI steps; owner-only email; and private FlowPilot data-record actions are implemented with bounded execution and safe logs. |
| Monitoring and retries | Execution history/detail, safe logs, bounded transient step retries, and one manual retry for eligible runs are implemented. Node-level AI/HTTP/email and Neon credential/record requests respect execution budgets. Route-level persistence can still be interrupted by serverless termination; client cancellation cannot prove a database statement already accepted was rolled back. |
| Native app connectors | Airtable, Gmail, Slack, Google Sheets, Drive, and Calendar are planned capabilities, not complete product connectors until owner authorization, useful actions/triggers, mapping, failure behavior, and end-to-end verification all exist. A generic HTTP node or placeholder page does not count. |
| Production E2E | Health and database connectivity are verified. Authenticated workflow creation, activation, provider authorization, execution, and recovery still need a safe end-to-end production test. |

## Development rules and ordering

1. Follow the priority order in [`autonomous-development-prompt.md`](autonomous-development-prompt.md): broken behavior, production/deployment, database/API, security, visual builder, execution, monitoring, connector platform, then native apps and polish.
2. Each autonomous run should complete one highest-value, verifiable improvement rather than start several unfinished features. Avoid repeating audits when an actionable issue is already known.
3. Preserve ownership checks, data isolation, secret boundaries, mobile responsiveness, and the Vercel dispatcher. Inspect the existing schema/migrations before database work; do not make destructive production changes.
4. Use small pull requests, keep CI green, verify Vercel Preview, merge only safe changes with required checks passing, and verify production when practical.
5. Keep status honest: a feature is not production-ready until its real auth/configuration, execution path, failure handling, tests, docs, and provider dependencies are verified.

## Phase 0 — Project constitution and architecture (**complete**)

Establish repository rules, architecture, environment examples, and the frontend/server/database/AI boundaries. Keep project principles in `AGENTS.md` aligned with the current Vercel + Neon system; label historical Netlify references clearly rather than silently rewriting history.

**Exit criteria:** documented architecture and development/security rules agree with the implementation.

## Phase 1 — Application foundation (**complete**)

Build the React, TypeScript, Vite, Tailwind/shadcn UI, routing, app shell, and data-fetching foundation.

**Exit criteria:** the app builds, routes render, and the shared layout works on desktop and mobile.

## Phase 2 — Database, authentication, and protected APIs (**implementation complete; production E2E follow-up remains**)

- **2A — Database infrastructure:** Drizzle with Neon PostgreSQL over the server-side Neon HTTP driver; preserve migration files under their existing historical path.
- **2B — Schema:** users, workflows, nodes, connections, executions, execution logs, credentials, and related persistence.
- **2C — Authentication:** email/password account flows, password hashing, expiring/revocable server-side sessions, and secure cookies.
- **2D — Authorization/API:** owner-scoped workflow metadata APIs, validated payloads, and protected graph persistence.

**Remaining hardening:** verify production and staging environment separation, migration state, email ownership/verification, session lifecycle, and complete auth-to-workflow flows. Do not infer those guarantees from unit tests alone.

## Phase 3 — Visual workflow builder (**complete baseline**)

Provide the React Flow canvas, node library, drag/tap-to-add, connection editing, node configuration, graph validation, and owner-scoped persistence.

**Future improvements:** stronger data-mapping discovery and previews, easier testing/debugging, keyboard and accessible interactions, and responsive mobile editing. Keep UI status aligned with executable capabilities; do not expose a module as runnable if the engine cannot execute it.

## Phase 4 — Workflow execution engine (**complete baseline; reliability continues in Phase 8**)

Execute validated graphs in topological order with bounded node/step counts, an eight-second graph budget, context/data mapping, condition branching, filtering, privacy-minimized logs, and restricted public HTTPS requests. The engine supports manual workflows plus the trigger/action modules documented in [`workflow-engine.md`](workflow-engine.md).

**Exit criteria:** all executable node contracts have success/failure tests, owner checks happen before execution, outbound calls are constrained, and failures cannot silently continue into downstream side effects.

## Phase 5 — AI features (**complete baseline**)

Support server-side Gemini text generation, classification, extraction, and summarization through the shared provider abstraction, with input/output bounds, schema validation, timeout handling, and safe logs.

**Future improvements:** verify current provider/model APIs and quotas when changed; never claim live provider verification without the necessary credential and a safe test.

## Phase 6 — Bring-your-own AI credentials (**complete baseline; ongoing security review**)

Support owner-scoped Gemini/OpenAI credentials encrypted at rest, curated provider/model choices, server-side resolution/decryption, masked metadata, and no plaintext secrets in workflow data or logs.

**Exit criteria:** encryption-key configuration/recovery, owner binding, credential revocation, provider error handling, and production environment setup are reviewed and documented.

## Phase 7 — Built-in triggers and internal actions (**complete bounded slice**)

Implement manual, webhook, and daily scheduled triggers; owner-only email notification; and owner-private FlowPilot data-record create/update actions. See [`schedule-trigger.md`](schedule-trigger.md) for the supported schedule window and limits.

**Important boundary:** these built-ins do not provide third-party Airtable/Gmail/Slack/Google account connections. Native connector work begins only after the shared integration foundation in Phase 10.

## Phase 8 — Execution monitoring, logs, and reliability (**in progress**)

**Complete:** execution history with filters/paging, per-run detail and safe step logs, bounded transient retries, one manual retry for eligible failed/interrupted runs, engine limits, outbound/AI/email timeouts, and per-node cancellation signals for Neon credential and record operations.

**Remaining work:**
- Make pending/running state finalization and route-level persistence more resilient to Vercel invocation termination; test interrupted-run display, retry, and stale-state transitions.
- Review idempotency and partial-side-effect behavior, including the fact that aborting a client request cannot guarantee a remote provider or accepted SQL statement stopped.
- Exercise timeout, retry, log redaction, and failure behavior across manual, webhook, and scheduled entry points.
- Keep execution history responsive and useful as volume grows; add operational metrics only with privacy-safe retention and clear ownership.

**Exit criteria:** no stuck run is silently reported as complete, users can understand and safely recover eligible failures, and execution remains bounded with tested partial-side-effect semantics.

## Phase 9 — Production hardening, security, and verification (**planned / partially implemented**)

- Resolve the production alias mismatch through the Vercel project/team that owns `flowpilot-app.vercel.app`; do not attempt a bypass. Until then, clearly identify the repository-linked domain.
- Verify registration/login/logout, authorization boundaries, workflow CRUD, graph editing, activation, manual/webhook/scheduled execution, AI credential use, history, retry, and data persistence against a safe production test account.
- Review current dependency advisories, including build-only dependencies; make compatible, tested updates and document any advisory that requires a larger migration.
- Add appropriate rate limits, per-user quotas, abuse/cost controls, webhook protections, and production monitoring; set limits before exposing expensive AI or public-trigger surfaces broadly.
- Review email verification, account recovery, session lifecycle, credential key rotation/recovery, logs/privacy, outbound egress, database backups, migration safety, and rollback procedures.
- Ensure environment examples, `AGENTS.md`, README, and operational docs correctly identify Vercel + Neon. Retain legacy Netlify code until dependency analysis proves removal is safe.

**Exit criteria:** production flows have real end-to-end evidence; security and abuse controls are adequate for the expected audience; rollout and recovery procedures are documented.

## Phase 10 — Reusable native integration foundation (**planned; prerequisite for app connectors**)

Build the general integration/account layer before provider-specific workflow modules:

- Define owner-scoped connected accounts separately from AI credentials where their lifecycles differ; audit the existing schema before adding or changing tables.
- Implement secure OAuth authorization with state/CSRF protection, PKCE where appropriate, least-privilege scopes, encrypted server-side tokens, refresh, expiry, revoke/disconnect, and reconnect behavior.
- Build reusable connector metadata, trigger/action contracts, typed configuration, credential resolution, field discovery/mapping, safe output summaries, and error normalization.
- Add a responsive Connected Apps UI with connect, status, reconnect, and disconnect states; never expose access/refresh tokens to the browser or logs.
- Test owner isolation, token encryption and refresh, state mismatch, provider errors, revoked/expired accounts, concurrent execution, and safe retries.

**Exit criteria:** at least one test connector can complete the full connect → configure → execute → map output → disconnect lifecycle without provider-specific security shortcuts.

## Phase 11 — Airtable connector (**planned; first native app**)

Deliver a small complete vertical slice: account authorization, discover/select a base and table, useful record actions (for example, list/search/create/update), safe output mapping, user-facing configuration errors, and tests. Add a trigger only when its webhook/polling semantics, rate limits, and deployment requirements are understood and verified. Document permissions, API limits, and any setup required from the workspace owner.

**Exit criteria:** a safe test account connects, performs supported actions and any advertised trigger end to end, and disconnect/revocation behaves correctly.

## Phase 12 — Gmail connector (**planned**)

Implement Google account authorization using only the scopes needed for the selected operations. Begin with narrowly scoped, useful email actions; add message search/read or draft/send actions only after permissions, Gmail API limits, sender identity, abuse controls, and user consent are clear. Gmail triggers may require Google Cloud Pub/Sub, watch renewal, push delivery, and a verified OAuth app; do not present polling or a webhook placeholder as a working Gmail trigger.

**Exit criteria:** account authorization, configuration, safe mapping, action/trigger behavior, permissions, quota/verification dependencies, and failure handling are documented and tested using a safe account.

## Phase 13 — Slack connector (**planned**)

Add Slack OAuth with minimal scopes, workspace/channel selection, useful message actions, and—if supported by verified event subscriptions—an event trigger. Validate Slack request signatures, replay/timestamp protections, workspace ownership, rate limits, private channel access, and safe output mapping. Clearly expose required app installation and event subscription setup.

**Exit criteria:** a safe test workspace completes connection, supported actions/triggers, data mapping, disconnect, and failure recovery.

## Phase 14 — Google Sheets connector (**planned**)

Reuse the Google OAuth foundation with Sheets-specific least-privilege scopes. Implement spreadsheet/tab discovery and a useful initial set such as read, append, and update rows with predictable range/field mapping. Determine and document whether triggers are polling-based or derived from another supported event source; the Sheets API itself must not be described as providing a trigger mechanism unless verified.

**Exit criteria:** actions and any advertised trigger execute end to end with validated column mapping, pagination/limits, authorization, and test coverage.

## Phase 15 — Google Drive connector (**planned**)

Implement scoped file search/list and useful metadata/content actions within safe file-size and MIME limits. If supporting change triggers, use the correct Google Drive change/watch flow, channel renewal, verification, and deduplication. Avoid downloading or logging private file contents unnecessarily.

**Exit criteria:** authorization, file selection, supported actions/triggers, ownership/permission edge cases, limits, and data privacy are verified and documented.

## Phase 16 — Google Calendar connector (**planned**)

Implement calendar selection, event list/create/update actions, time-zone handling, recurrence/attendee validation, and safe event-data mapping. If adding event triggers, use a verified incremental sync/watch design with channel renewal, deduplication, and provider limits.

**Exit criteria:** a safe test account can connect and execute supported event operations/triggers correctly across time zones, recurring events, and revoked/expired authorization.

## Phase 17 — Product UX, accessibility, and scale (**planned; incremental improvements may happen earlier**)

Polish onboarding, templates, connector catalog, workflow diagnostics, analytics, mobile/tablet use, keyboard navigation, accessibility, empty/loading/error/success states, and performance. Add features only where supported by working engine and API behavior. Measure large bundles and slow pages before optimizing; preserve established workflows.

**Exit criteria:** users can discover capabilities, configure workflows without guesswork, recover errors, and operate the builder and execution history on mobile and desktop.

## Phase 18 — Production acceptance and ongoing connector expansion (**final acceptance / recurring**)

Run the full documented acceptance suite against the real production domain and safe accounts; verify database state, auth/authorization, visual save/reload, manual and event execution, AI, retries, logs, privacy, app connections, scheduled execution, mobile UX, deployment rollback, and monitoring. Record any OAuth verification, scope approval, provider credential, billing, quota, or external coordination dependency that remains. Only mark FlowPilot complete once the definition of done below is met; after that, stop speculative feature work and prioritize fixes, maintenance, and deliberately selected new connectors.

## Definition of done

FlowPilot is ready when the important user journey works end to end in production: secure authentication/authorization; responsive visual workflow creation, connection and data mapping; reliable bounded execution; AI and user credentials; webhook and scheduled triggers; execution history, logs, retry and recovery; persistent data and database connectivity; deployment/security/abuse controls; and a usable, verified native integration experience for Airtable, Gmail, Slack, Google Sheets, Drive, and Calendar. Each connector must have real account authorization, supported triggers/actions, mapping, error behavior, tests, and documentation. State provider verification and credential dependencies honestly; a successful build alone is not completion.

## How to maintain this roadmap

At the end of each development run, update the relevant phase status only when implementation and evidence justify it. Add short dated notes for significant milestones and links to PRs or docs where useful; do not turn this file into a transcript. Keep the next highest-priority task explicit, and ensure the scheduled task reads this roadmap plus [`autonomous-development-prompt.md`](autonomous-development-prompt.md) before acting.
