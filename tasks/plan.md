# Implementation Plan: `webhook-trigger`

## Source of truth

- Capability map: `CAPABILITY-MAP.md`
- Module specification: `SPEC-webhook-trigger.md`
- Baseline: `dc85b64` on `origin/main`

## Planning decisions and defaults

The user approved proceeding after specification review. The following defaults are carried into implementation unless new repository evidence requires a spec update:

- Proceed from `dc85b64`; the handoff commit `173395b` is not available in the current refs.
- Store the opaque webhook token in the workflow row, expose it only in the authenticated owner’s workflow metadata, and do not add rotation in this slice.
- Preserve synchronous safe execution-summary responses for valid webhook calls.
- Validate the complete persisted graph before activation and again before public execution.
- Reuse the current execution tables, bounded engine, safe logging, request-body parser, ownership predicates, and Zod validation.
- Do not add rate limiting, queueing, replay protection, signatures, or production deployment work in this module.

If implementation discovers that any of these decisions conflicts with the existing architecture, update the specification before changing code.

## Dependency graph

```text
T1 baseline reconciliation
  └─> T2 contract fixtures and token design
        ├─> T3 schema + migration + server-generated token
        │     └─> T4 graph/engine trigger-category support
        │           └─> T5 owner activation + metadata API
        │                 └─> T6 public webhook handler
        │                       ├─> T7 focused security/handler tests
        │                       └─> T8 editor integration + docs
        └──────────────────────────────────────────────────────────────┘

T7 + T8 ──> T9 full verification and review checkpoint
```

## Implementation order and checkpoints

### Phase A — Reconcile and lock the baseline

1. Search all refs/object history for `173395b` and compare the handoff-listed webhook files against the checked-out tree.
2. Confirm no existing webhook implementation is being overwritten and identify exact current helper contracts.
3. Record the baseline result in the module documentation and keep the implementation scoped to the approved spec.

**Checkpoint A:** repository status is known; no code is edited until the missing commit decision is recorded.

### Phase B — Persistence and trusted trigger contract

1. Define the token generator and strict token format/length.
2. Add the workflow token schema and migration/backfill with uniqueness and non-null enforcement.
3. Generate new-workflow tokens server-side and prevent client-supplied token fields.
4. Extend graph validation/types for exactly one Webhook Trigger while preserving existing trigger rules.
5. Extend the engine’s trusted trigger-category option and keep manual execution manual-only.

**Checkpoint B:** schema checks, migration checks, graph tests, engine tests, and all pre-existing tests pass.

### Phase C — Protected activation API

1. Extend metadata update validation for `isActive`.
2. Load and validate the owned graph before activation.
3. Apply activation/deactivation only through owner-scoped mutations.
4. Return the owner-visible token in metadata without exposing it to other users or generic errors.

**Checkpoint C:** authenticated API tests prove ownership, activation validation, no partial activation, and token-field rejection.

### Phase D — Public webhook execution

1. Add a thin public Netlify Function at `/api/hooks/:webhookToken`.
2. Normalize invalid, malformed, inactive, and wrong-trigger tokens to the same 404 response.
3. Parse only bounded JSON-object input.
4. Reuse the existing graph loading, execution persistence, provider resolver, engine, safe logging, and generic failure handling patterns.
5. Return the approved safe execution summary for valid calls.
6. Add dependency injection or the smallest handler seam needed for focused tests; do not duplicate the manual execution route.

**Checkpoint D:** focused handler tests cover successful execution, all public 404 cases, invalid bodies, persistence failures, and privacy redaction.

### Phase E — Editor and documentation integration

1. Add typed metadata/API support for `isActive` and webhook token.
2. Display and copy the endpoint only when a Webhook Trigger exists.
3. Prevent activation with unsaved graph changes and explain secret URL/activation behavior.
4. Update workflow API, engine, roadmap, and operational/security documentation.

**Checkpoint E:** frontend build passes and manual editor review confirms no token appears outside the owner’s intended UI.

### Phase F — Final verification

Run the full repository checks:

```bash
npm run lint
npm test
npm run build
npx drizzle-kit check
git diff --check
```

Review the diff for owner scope, secret leakage, raw payload persistence, migration safety, and accidental changes to manual execution. Do not apply a live migration or deploy.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Handoff commit is missing | Reconcile refs first; implement only against verified baseline; do not claim recovered behavior. |
| Token leakage through metadata/logging/errors | Centralize safe response mapping; add explicit secret-redaction tests; never log route params. |
| Activation bypasses graph validation | Validate persisted graph server-side before state mutation and at execution time. |
| Webhook route accidentally permits inactive/foreign workflows | Single generic 404 branch and active-token query; no ownership details in public responses. |
| Manual execution accepts webhook graphs | Trigger category is selected by trusted route and tested separately for manual/webhook paths. |
| Request body or execution remains unbounded | Reuse 16 KiB parser and existing node/step/time limits. |
| Migration fails on existing rows | Backfill unique tokens before enforcing non-null/unique constraints; run Drizzle checks. |
| Handler is untestable | Extract minimal dependency seam or pure helpers; avoid broad refactor. |
| Public endpoint becomes production abuse surface | Document and preserve the explicit Phase 9 boundary: rate limits, quotas, monitoring, and egress review remain required. |

## Parallelism

- T1 must be sequential and precedes all implementation.
- T2 can be prepared alongside T1 but must be finalized after baseline reconciliation.
- T3 and T4 are sequential because the engine contract depends on persisted trigger identity.
- T5 follows T3/T4 because activation relies on schema and graph semantics.
- T6 follows T5 because public execution relies on activation/token contracts.
- T7 can proceed alongside T8 after T6, with separate files and deterministic fixtures.
- T9 is sequential after all implementation and documentation tasks.

## Verification checkpoints

Each task below has its own focused verification. No task is complete if it weakens an existing test or leaves the repository unable to run the full checks in Phase F.
