# Tasks: `webhook-trigger`

- [x] **T1 — Reconcile the webhook baseline and lock scope**
  - Acceptance: Confirm `173395b` is unavailable from current refs/object history, record the verified `dc85b64` baseline, and identify the current helper contracts that implementation will reuse.
  - Verify: `git status --short --branch`; `git log --all --oneline --decorate --grep='webhook' -i`; inspect existing workflow, graph, engine, auth, and database files; no application files changed.
  - Files: `SPEC-webhook-trigger.md` or implementation notes only if baseline facts need correction.

- [x] **T2 — Define webhook token and trigger contract fixtures**
  - Acceptance: Token format/length, generation boundary, public route contract, trigger category names, safe 404 behavior, and test fixture shapes are explicit and consistent with the approved spec.
  - Verify: Review against `SPEC-webhook-trigger.md`; add/adjust deterministic type/schema tests only when implementation begins.
  - Files: `src/types/workflow.ts`, `src/server/workflows/validation.ts`, `tests/workflow-graph.test.ts` (as needed).

- [x] **T3 — Add webhook token persistence and server-side creation**
  - Acceptance: Existing workflows receive unique non-null tokens through a safe migration/backfill; new workflows receive server-generated URL-safe cryptographic tokens; client payloads cannot set or update tokens.
  - Verify: `npx drizzle-kit check`; migration-focused tests; workflow create/update API tests; inspect SQL for backfill-before-constraint ordering and unique index.
  - Files: `src/db/schema.ts`, `netlify/database/migrations/<phase-7-webhook-migration>.sql`, `netlify/functions/workflows.ts`, `netlify/functions/workflow.ts`, `tests/workflows-api.test.ts`.

- [x] **T4 — Extend graph validation and bounded engine trigger selection**
  - Acceptance: Exactly one Webhook Trigger is accepted for webhook runs; manual runs remain restricted to Manual Trigger; trigger output preserves the existing received marker; unsupported graph rules remain strict.
  - Verify: `npm test -- --test-name-pattern='workflow|execution'` or the repository-equivalent focused test command; include positive webhook and negative manual/webhook mismatch cases.
  - Files: `src/types/workflow.ts`, `src/server/workflows/graph-validation.ts`, `src/server/execution/engine.ts`, `tests/workflow-graph.test.ts`, `tests/workflow-execution.test.ts`.

- [x] **T5 — Implement owner-scoped activation and metadata responses**
  - Acceptance: `PATCH /api/workflows/:workflowId` accepts `isActive`; activation validates the persisted owned graph before mutation; deactivation is owner-scoped; owner metadata includes the token; foreign resources remain indistinguishable from missing resources.
  - Verify: `npm test -- --test-name-pattern='workflows-api|ownership'`; tests prove invalid activation does not partially update `isActive`, token fields are rejected, and foreign users cannot read or mutate the workflow.
  - Files: `src/server/workflows/validation.ts`, `netlify/functions/workflow.ts`, `netlify/functions/workflows.ts`, `src/lib/workflow-api.ts`, `tests/workflows-api.test.ts`.

- [ ] **T6 — Add the public webhook execution handler**
  - Acceptance: `POST /api/hooks/:webhookToken` accepts no session, enforces a 16 KiB JSON-object body, normalizes unknown/malformed/inactive/wrong-trigger tokens to generic 404, executes only active valid webhook graphs, persists safe execution state/logs, and returns a safe summary.
  - Verify: Focused handler tests cover valid completion, invalid token classes, malformed/oversized/non-object body, invalid graph, persistence failure, unsupported methods, and no raw token/payload leakage.
  - Files: `netlify/functions/webhook-trigger.ts`, `src/server/execution/logging.ts` (only if needed), `tests/webhook-trigger.test.ts`, `tests/http.test.ts` (only if shared parser behavior changes).

- [ ] **T7 — Add webhook security and privacy regression coverage**
  - Acceptance: Tests prove tokens never appear in logs/errors/public invalid-token responses, raw webhook bodies are not persisted, execution limits remain active, and manual execution behavior is unchanged.
  - Verify: `npm test`; inspect test fixtures for secrets and raw sensitive payload assertions.
  - Files: `tests/webhook-trigger.test.ts`, `tests/workflow-execution.test.ts`, `tests/response-schema.test.ts` (as needed).

  - Status note: pure token/body contracts and engine isolation are covered; full database-backed handler orchestration/privacy tests remain pending until the handler has an injectable database boundary or a configured test database.

- [x] **T8 — Integrate editor controls and update documentation**
  - Acceptance: The editor displays/copies the endpoint only for webhook graphs, communicates activation and bearer-secret behavior, blocks activation with unsaved changes, and documentation matches the implemented public API/security contract.
  - Verify: `npm run lint`; `npm run build`; manually inspect the editor flow using the configured local Netlify environment where available; grep docs for stale Phase 7 webhook claims.
  - Files: `src/lib/workflow-api.ts`, `src/pages/WorkflowEditorPage.tsx`, `src/components/workflow/NodeConfigurationEditor.tsx`, `docs/workflow-api.md`, `docs/workflow-engine.md`, `docs/roadmap.md`, `README.md`.

- [x] **T9 — Run full verification and prepare review diff**
  - Acceptance: All tests, type checks, build, Drizzle checks, and diff hygiene pass; the diff contains no secrets, unrelated refactors, raw payload storage, token logging, production migration application, or deployment claims.
  - Verify: `npm run lint && npm test && npm run build && npx drizzle-kit check && git diff --check`; review `git diff --stat` and `git diff`.
  - Files: Any files changed by T2–T8; no new files outside approved scope without updating the spec/plan.
