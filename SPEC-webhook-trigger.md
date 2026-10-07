# Spec: `webhook-trigger` Module

## Status

**Approved for planning.** This module specification is approved for implementation planning. No application code, migration, tests, or deployment changes are included in this step.

## Baseline and reconciliation objective

The supplied handoff describes a completed webhook-trigger slice at commit `173395b`, but the available repository is clean at `dc85b64` (`origin/main`) and does not contain that commit, its webhook function, or its Phase 7 migration. The first implementation task must therefore verify whether the missing commit can be recovered from an authorized ref or object database. If it cannot, the slice will be implemented incrementally against the checked-out Phase 6 baseline, preserving existing contracts and tests.

The module must add a secure public webhook trigger to FlowPilot’s existing visual workflow system. An owner activates a workflow containing exactly one Webhook Trigger node; an external caller invokes a non-guessable token URL; the server validates the active owned workflow graph, executes it through the existing bounded engine, persists privacy-minimized execution state/logs, and returns only a safe execution result.

## Assumptions I am making

1. The webhook slice remains synchronous and uses the current bounded execution engine; durable queues and background workers are out of scope.
2. A webhook token is an opaque, cryptographically random server-generated bearer secret, stored in the workflow row and never accepted from client mutation payloads.
3. The public route is `POST /api/hooks/:webhookToken`; no user session or same-origin header is required because possession of the token is the trigger authorization mechanism.
4. Webhook workflows use the existing `executions` and `execution_logs` tables and the same safe execution response shape as manual runs.
5. The trigger input is a JSON object with a maximum serialized request body of 16 KiB; raw payload contents are not persisted or logged.
6. A workflow may contain at most one trigger node, and a webhook execution requires exactly one `webhook_trigger` node.
7. Activation is an owner-scoped metadata mutation. Activation is rejected or remains unavailable when the graph is unsaved or invalid; the exact UI affordance may follow the existing editor patterns.
8. The server will use Node’s cryptographic random-byte facilities and a URL-safe token encoding; the token will be compared as an exact value.
9. Unknown, malformed, inactive, wrong-trigger, and non-existent tokens intentionally produce the same public `404 Workflow not found` response.
10. Existing manual execution remains manual-only and must not begin accepting webhook graphs accidentally.

## Objective

### User outcome

A workflow owner can configure and activate a Webhook Trigger, copy its endpoint URL, and receive external JSON events that run the workflow without opening the FlowPilot browser. External callers receive a bounded, deterministic response while the system protects workflow ownership, token privacy, execution limits, and log privacy.

### In scope

- Schema and migration support for a unique non-null webhook token.
- Server-generated token creation for new workflows and safe backfill for existing workflows.
- Owner-scoped activation/deactivation through the workflow metadata API.
- Webhook trigger node type/category validation and graph execution compatibility.
- Public `POST /api/hooks/:webhookToken` handler.
- Strict body parsing, JSON-object validation, and 16 KiB limit.
- Reuse of the existing bounded topological engine with a distinct webhook trigger category.
- Execution persistence and safe response handling for webhook runs.
- Editor display/copy affordance and activation-state feedback when a webhook node exists.
- Focused handler, engine, API, graph-validation, migration, and privacy regression tests.
- Documentation updates for API, engine, roadmap, and operational security boundaries.

### Out of scope

- Schedule/Cron triggers.
- Email or database actions.
- Rate limiting, quotas, abuse monitoring, replay protection, or idempotency keys beyond existing bounded execution safeguards.
- Durable asynchronous execution, retries, status polling, or execution-history UI.
- Raw webhook payload retention, payload replay, custom authentication headers, signatures, or multiple trigger nodes.
- Live deployment, applying a production migration, or live provider calls.

## Functional requirements

### FR-1: Workflow identity and token lifecycle

1. Every workflow has one non-null webhook token after migration.
2. Existing rows receive a cryptographically strong unique token during migration/backfill.
3. New workflows receive a server-generated token; clients cannot supply, update, or rotate it through ordinary metadata or graph payloads.
4. The authenticated owner receives their own token in the workflow metadata response, because the token is needed to construct the endpoint URL. Foreign workflows remain indistinguishable from missing workflows.
5. Token values are never included in server logs, execution logs, error messages, or public responses other than the authenticated owner’s workflow metadata response.
6. Token rotation is not part of this slice unless the baseline reconciliation reveals an existing established contract requiring it; if rotation is proposed, it must be a separate security-reviewed requirement.

### FR-2: Activation

1. `PATCH /api/workflows/:workflowId` accepts `isActive: boolean` in addition to existing editable metadata.
2. The mutation derives owner identity from the verified session and scopes the update by workflow ID plus owner ID.
3. Activating a workflow validates that its persisted graph is valid and contains exactly one Webhook Trigger node.
4. Activation of a workflow with no trigger, multiple triggers, an invalid graph, or a non-webhook trigger fails with a safe client error and does not change `isActive`.
5. Deactivation is owner-scoped and does not delete graph data or execution history.
6. The editor must not activate a graph with unsaved changes; the server remains authoritative and repeats validation.

### FR-3: Public webhook route

1. `POST /api/hooks/:webhookToken` is publicly callable without a session.
2. The route accepts only `POST`; unsupported methods return `405` with an appropriate `Allow` header without revealing token validity.
3. The request body is parsed through the existing bounded JSON-body helper with a 16 KiB cap.
4. The body must be a JSON object; arrays, scalars, malformed JSON, and oversized bodies are rejected without starting an execution.
5. The handler resolves the token to an active workflow and validates the graph before execution.
6. Unknown, malformed, inactive, and wrong-trigger tokens return the same `404` response and do not disclose ownership, activation state, workflow ID, or database details.
7. A valid request creates a pending/running execution, runs the bounded engine with `triggerCategory: 'webhook_trigger'`, persists safe logs, and returns a safe execution summary.
8. The route never logs or persists the raw request body. The execution trigger record may retain only a received marker and bounded field-count metadata consistent with `summarizeTriggerInput`.
9. Existing runtime limits remain effective: at most 50 graph nodes, at most 25 executed nodes, an eight-second graph budget, and existing outbound/AI limits.
10. Unexpected persistence or execution failures return a generic service error and do not expose provider, database, token, or stack details.

### FR-4: Execution engine

1. `WorkflowExecutionOptions` gains an explicit trigger category that supports at least `manual_trigger` and `webhook_trigger`; the default remains manual for backward compatibility.
2. The engine requires exactly one matching trigger category for the requested execution.
3. Webhook Trigger produces the same internal received marker as Manual Trigger, while the external trigger category remains distinct for validation and authorization.
4. Manual execution rejects graphs whose sole trigger is Webhook Trigger.
5. Trigger category is not accepted from untrusted browser input; the route selects it from the trusted invocation path.
6. Existing graph traversal, branch routing, template safety, AI credential checks, outbound HTTPS protections, and safe logging remain unchanged unless a focused webhook test proves a necessary compatibility adjustment.

### FR-5: Editor and API presentation

1. Authenticated workflow metadata includes `isActive` and the owner-visible webhook token when the current API contract permits it.
2. When a Webhook Trigger exists, the editor displays `/api/hooks/<webhookToken>` and offers a copy action.
3. The UI communicates that the URL is a secret bearer endpoint and that activation is required.
4. Activation is disabled while the graph has unsaved changes or while required webhook configuration is invalid.
5. The browser never receives database credentials, encryption keys, unrelated users’ tokens, raw execution payloads, or internal error details.

## API contract

### Protected metadata update

`PATCH /api/workflows/:workflowId`

Request examples:

```json
{ "isActive": true }
```

```json
{ "title": "Inbound triage", "isActive": false }
```

Rules:

- Valid authenticated session required.
- Same-origin request required under the existing protected API convention.
- Strict Zod validation; reject unknown fields and client identity fields.
- Owner-scoped update.
- Activation performs graph validation before committing the state change.

### Public execution

`POST /api/hooks/:webhookToken`

Request:

```json
{ "event": "ticket.created", "ticket": { "priority": "High" } }
```

Success response shape:

```json
{
  "execution": {
    "id": "<execution-uuid>",
    "workflowId": "<workflow-uuid>",
    "status": "completed",
    "startedAt": "<iso-timestamp>",
    "completedAt": "<iso-timestamp>",
    "error": null,
    "logs": [
      {
        "nodeId": "<node-uuid>",
        "status": "success",
        "timestamp": "<iso-timestamp>"
      }
    ]
  }
}
```

Safe error classes:

- `404`: generic workflow-not-found response for every invalid/inactive/wrong-trigger token case.
- `400`: malformed JSON or body that is not an object.
- `413`: body exceeds 16 KiB.
- `405`: unsupported method.
- `422`: valid token/workflow whose graph cannot be executed.
- `503`: generic execution service failure.

Exact status/message behavior must follow existing `jsonResponse` and `parseJsonBody` conventions and must not reveal token validity beyond the intentionally shared public responses.

## Data and security design

### Schema

Add a `webhook_token` column to `workflows` with a unique index and non-null final state. The migration must safely handle existing rows before enforcing non-null and uniqueness. The token length and encoding must be documented and validated consistently in server and database code.

The schema must not store a hash-only token unless the owner-facing API has a deliberate secure strategy for recovering or rotating the endpoint secret. If plaintext token storage is selected for this slice, access remains server/database-only except for the authenticated owner metadata response, and the token must never appear in logs or generic error paths.

### Authorization

- Protected reads and mutations always scope by verified session owner plus resource ID.
- The public token is the only authorization input for the webhook route.
- Do not derive owner identity from webhook payloads, headers, query parameters, or graph configuration.
- Do not disclose whether an inactive or foreign workflow owns a token.

### Input and execution safety

- Enforce the existing 16 KiB body limit before materializing an unbounded request.
- Accept JSON objects only.
- Revalidate the stored graph on each public invocation; do not trust a previously activated state alone.
- Keep all existing execution node, time, AI, template, outbound HTTPS, and response-size bounds.
- Do not add redirects, arbitrary headers, credentialed outbound targets, or custom provider URLs.

### Privacy and logging

Allowed execution summaries include status, node IDs, safe error text, timestamps, model/usage metadata, and output sizes already approved by the engine contract.

Never persist or log:

- Webhook token values.
- Raw webhook request bodies or field values.
- Full sensitive URLs.
- AI prompts or completions.
- Provider exception bodies, keys, ciphertext, session tokens, or stack traces.

## Project structure and expected changes

The implementation should remain within the existing architecture:

```text
src/db/schema.ts                         # webhook_token schema definition
netlify/database/migrations/             # generated Phase 7 migration
src/server/workflows/validation.ts      # strict activation/update validation
src/server/workflows/graph-validation.ts# Webhook Trigger configuration/type rules
src/server/execution/engine.ts          # trigger-category execution contract
netlify/functions/workflow.ts           # owner-scoped activation and metadata response
netlify/functions/workflows.ts          # server-generated token on creation, if needed
netlify/functions/workflow-executions.ts# preserve manual-only behavior
netlify/functions/webhook-trigger.ts    # new public route
src/lib/workflow-api.ts                 # metadata/API types and client helpers
src/pages/WorkflowEditorPage.tsx        # activation, URL display, copy behavior
src/components/workflow/                # node inspector/configuration if needed
src/types/workflow.ts                   # shared trigger type/category additions
src/server/execution/logging.ts         # only if safe trigger summaries need a focused helper

tests/webhook-trigger.test.ts           # focused public handler orchestration tests
tests/workflow-execution.test.ts        # trigger-category engine tests
tests/workflows-api.test.ts             # activation/token ownership tests
tests/workflow-graph.test.ts            # webhook graph validation tests
```

Do not create parallel auth, database, execution, or credential abstractions. Reuse existing helpers and dependency-injection seams; if the current handler is difficult to test, extract the smallest pure/orchestrating dependency boundary rather than duplicating the workflow execution route.

## Commands

```bash
npm install
npm run lint
npm test
npm run build
npx drizzle-kit check
git diff --check
```

Local development:

```bash
npm run dev
npx netlify dev
```

The Netlify function environment and a configured database are required to exercise the API routes. Tests must use deterministic fixtures/fakes and must not make live provider calls or send real webhooks to production.

## Code style

Use strict TypeScript, explicit types, small single-purpose helpers, existing Zod schemas, owner-scope query predicates, and safe generic errors. Example shape:

```ts
const webhookToken = createWebhookToken();

const parsed = webhookRequestSchema.safeParse(body.value);
if (!parsed.success) {
  return jsonResponse(400, { error: 'Webhook body must be a JSON object.' });
}

const [workflow] = await db
  .select({ id: workflows.id, isActive: workflows.isActive })
  .from(workflows)
  .where(eq(workflows.webhookToken, token))
  .limit(1);

if (!workflow?.isActive) {
  return jsonResponse(404, { error: 'Workflow not found.' });
}
```

Conventions:

- `camelCase` for variables/functions, `PascalCase` for types/classes.
- Prefer `unknown` plus validation over `any`.
- Never include secrets in error strings, logs, snapshots, or test fixtures.
- Keep route handlers thin; put graph and execution behavior in existing server modules.
- Avoid unrelated formatting or architectural refactors.

## Testing strategy

### Unit tests

- Token generation has sufficient length/entropy shape, uses URL-safe output, and does not reuse values across generated workflows in deterministic test samples.
- Update schemas accept only intended fields and reject owner/token fields.
- Graph validation accepts exactly one correctly configured Webhook Trigger and rejects missing, multiple, or incompatible triggers.
- Engine runs a Webhook Trigger graph, rejects a manual run against a webhook graph, and preserves existing manual behavior.
- Webhook body parsing rejects malformed JSON, arrays/scalars, and bodies over 16 KiB.
- Logging tests prove token and raw payload values do not appear in persisted summaries or response bodies.

### Handler/integration tests

`tests/webhook-trigger.test.ts` should use injected database and execution dependencies or a focused handler factory to verify:

- Valid active token executes the correct workflow and returns a safe result.
- Unknown, malformed, inactive, and wrong-trigger tokens all return indistinguishable `404` responses.
- A foreign workflow cannot be activated or read through authenticated routes.
- No execution row is created for invalid body, invalid token, inactive workflow, or invalid graph.
- Execution persistence failures return generic `503` and do not expose internal details.
- Manual execution remains restricted to Manual Trigger graphs.

### Regression and verification

All existing tests must continue to pass. The implementation is complete only when lint, full tests, production build, Drizzle migration checks, and diff hygiene pass. A live migration or deployment requires a separate operational approval and is not part of this specification.

## Boundaries

- **Always:** preserve owner-scoped queries; validate every request and stored graph; keep tokens and payloads out of logs; enforce body/runtime limits; use server-only secrets; run the complete verification commands before committing; update API/engine/roadmap documentation.
- **Ask first:** changing the execution status schema; changing token rotation or storage semantics; adding dependencies; changing Netlify deployment/scheduler configuration; introducing a queue, rate limiter, or external webhook signature provider; applying a production migration or deployment.
- **Never:** trust client-supplied owner IDs or webhook tokens for mutation; expose tokens in public errors or logs; persist raw webhook bodies; weaken SSRF protections; accept arbitrary node configuration; commit secrets; remove or weaken existing tests.

## Success criteria

1. The missing `173395b` baseline is either recovered from an authorized ref or its absence is documented and the webhook slice is implemented from `dc85b64` without losing existing functionality.
2. New and migrated workflows have unique, server-generated webhook tokens; clients cannot choose or update them.
3. An authenticated owner can activate/deactivate a valid webhook workflow, while invalid or foreign workflows remain protected.
4. `POST /api/hooks/:webhookToken` executes only active workflows with exactly one Webhook Trigger and returns a safe execution summary.
5. Unknown, malformed, inactive, and wrong-trigger tokens are indistinguishable `404` responses.
6. Invalid/oversized bodies do not create executions; valid input is limited to a JSON object of at most 16 KiB.
7. Manual execution remains manual-only; existing AI, template, outbound HTTPS, graph, and ownership safeguards remain intact.
8. No webhook token or raw payload appears in logs, persisted trigger data, generic errors, or public responses.
9. Focused webhook tests and the complete existing test/build/lint/migration checks pass.
10. Documentation clearly states the public endpoint’s security model and that rate limiting, abuse controls, migration application, and deployment verification remain required before production use.

## Open questions requiring resolution before planning

1. **Missing baseline:** Can the handoff commit `173395b` be supplied or recovered from another authorized environment, or should implementation proceed from `dc85b64` as a clean reimplementation?
2. **Token storage:** Is the intended token storage plaintext in the workflow row, or should the design use a hash plus a separate owner-visible secret/rotation mechanism? This affects schema and API behavior.
3. **Activation validation timing:** Must activation be rejected whenever a graph contains unsupported downstream nodes, or only when the trigger structure itself is invalid? The safer default is to validate the complete executable graph.
4. **Public response contract:** Should successful webhook calls return the full safe execution summary synchronously, or only an execution ID/status? The current spec preserves the handoff’s synchronous summary contract.
5. **Token rotation:** Is rotation required for the first webhook slice? The current scope excludes it to avoid accidentally creating an unreviewed secret-lifecycle API.
