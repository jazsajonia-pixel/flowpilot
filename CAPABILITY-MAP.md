# Capability Map: FlowPilot AI — Phase 7 Automation Integrations

## Scope

This map covers the remaining Phase 7 capabilities described in the handoff prompt. It deliberately excludes implementation of Phase 8 execution monitoring, Phase 9 production hardening, and Phase 10 product polish until these boundaries are reviewed.

## Baseline verification

- Repository cloned from `jazsajonia-pixel/flowpilot` at `dc85b64` (`origin/main`).
- Working tree is clean.
- The handoff claims local commit `173395b` and a completed webhook-trigger slice, but that commit is not present in the cloned repository or any advertised remote ref.
- The checked-out baseline currently documents webhook triggers as planned/in progress and does not contain the handoff-listed webhook implementation files or migration. The implementation plan must therefore begin with a baseline reconciliation rather than assuming the handoff commit exists.

## Modules

| Module ID | Responsibility | Depends on | Primary boundary |
|---|---|---|---|
| `webhook-trigger` | Reconcile and, if absent, implement the authenticated activation model and public webhook receiver described by the handoff; reuse bounded execution and preserve public-route privacy. | Existing workflow API, graph validation, execution engine, auth/session utilities, database schema | Public token is an authorization secret; no token/payload leakage; inactive/unknown workflows are indistinguishable. |
| `schedule-trigger` | Represent schedules, validate and activate them, invoke workflows server-side without a browser, and prevent duplicate/concurrent runs. | `webhook-trigger` trigger contract, existing execution engine, workflow ownership, database schema, deployment scheduler decision | No frontend timers; owner-scoped activation; bounded, idempotent, concurrency-safe invocation. |
| `email-action` | Add a constrained email notification node and provider/credential strategy without exposing SMTP/API secrets in graph data or logs. | Existing credential vault, graph validation, execution engine, `schedule-trigger` only for integration testing | Provider credentials remain encrypted and server-only; recipient/content limits and log redaction are mandatory. |
| `database-action` | Add constrained, schema-aware database CRUD actions for explicitly supported providers and encrypted owner-scoped connection credentials. | Existing credential vault, graph validation, execution engine, `email-action` independent | No arbitrary URLs or unrestricted SQL; provider operations and credential access are allowlisted and owner-scoped. |

## Dependency direction and build order

1. **Reconcile `webhook-trigger` first.** Confirm whether the handoff commit can be recovered or whether the slice must be reimplemented from the current `origin/main` baseline. Do not write downstream specs against an assumed webhook contract.
2. **Build `schedule-trigger` next.** Decide the server-side scheduler mechanism, schedule representation, trigger category/generalization, activation checks, idempotency key, and concurrency lock before coding.
3. **Build `email-action` and `database-action` in parallel after the scheduler contract is approved.** They share the credential and execution boundaries but should remain separate modules because each has an independently testable provider/security surface.
4. **Integrate and verify Phase 7 end-to-end.** Test manual, webhook, scheduled, email, and database paths with deterministic providers/fakes; perform security and privacy regression checks before considering Phase 7 complete.

## Cross-module contracts to specify

- Trigger categories and the exact execution-engine input contract.
- Workflow activation semantics and owner-scoped authorization.
- Bounded synchronous execution versus a durable background job boundary.
- Idempotency and concurrency behavior for repeated schedule ticks.
- Credential envelope, provider allowlists, rotation/deletion behavior, and failure-safe responses.
- Payload, template, URL, query/operation, timeout, and output limits.
- Execution-log fields that are safe to persist; raw payloads, secrets, prompts, email content, database bodies, and provider exception details remain excluded.

## Explicit non-goals for this map

- No frontend-only scheduler or browser timer.
- No arbitrary credentialed HTTP endpoint for email or database access.
- No unrestricted SQL execution.
- No production-readiness claim: migrations, deployment configuration, rate limits, quotas, abuse monitoring, and live provider/database verification remain separate gates.

## Review gate

Please approve or revise:

1. The module boundaries and IDs.
2. The dependency direction and build order.
3. Whether webhook reconciliation should be treated as the first module before schedule work.
4. The intended scheduler/deployment direction (Netlify scheduled functions, an external scheduler, or a durable job service) before the `schedule-trigger` module specification is written.
