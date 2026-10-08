# Protected Workflow and AI Credential API

Phase 2D introduced workflow metadata routes. Phase 3 adds graph read/write. Phase 4 adds user-initiated manual execution, Phase 5 adds Gemini-backed AI nodes, and Phase 6 adds owner-managed Gemini/OpenAI keys. Every protected endpoint derives identity from the Phase 2C opaque session cookie; clients cannot choose or change `ownerId`.

## Routes

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/workflows` | List only the authenticated user's workflows. | `200 { workflows: [...] }` |
| `POST` | `/api/workflows` | Create an inactive workflow for the authenticated user. | `201 { workflow: ... }` |
| `GET` | `/api/workflows/:workflowId` | Read one workflow only when its ID and owner both match the session. | `200 { workflow: ... }` |
| `PATCH` | `/api/workflows/:workflowId` | Update only editable metadata, scoped by workflow ID and owner. | `200 { workflow: ... }` |
| `DELETE` | `/api/workflows/:workflowId` | Delete only an owned workflow; execution history is preserved. | `200 { ok: true }` |
| `GET` | `/api/workflows/:workflowId/graph` | Read the owned workflow graph. | `200 { graph: { nodes, connections } }` |
| `PUT` | `/api/workflows/:workflowId/graph` | Atomically replace an owned workflow graph (one `db.batch`). Deactivates an active workflow whose new graph can no longer be activated. | `200 { ok: true, deactivated }` |
| `POST` | `/api/workflows/:workflowId/executions` | Start one synchronous manual run with `{ input?: { ... } }`. | `200 { execution: { id, workflowId, status, logs, ... } }` |
| `GET` | `/api/data-records` | List the owner's record collections, or with `?collection=` the latest 100 records. | `200 { collections }` / `200 { records }` |
| `DELETE` | `/api/data-records?collection=&key=` | Delete one owned record (same-origin). | `200 { ok: true }` |
| `GET` | `/api/internal/schedule-tick` | Vercel Cron target; requires `Authorization: Bearer $CRON_SECRET`. Not for browsers. | `200 { slot, considered, outcomes }` |
| `GET` | `/api/ai-credentials` | List the signed-in user's masked provider credentials. | `200 { credentials: [...] }` |
| `POST` | `/api/ai-credentials` | Encrypt and save one Gemini/OpenAI key. Body: `{ provider, name, apiKey }`. | `201 { credential: { id, provider, name, maskedKey, createdAt, updatedAt } }` |
| `DELETE` | `/api/ai-credentials/:credentialId` | Delete only a credential owned by the signed-in user. | `200 { ok: true }` |

Credential list/create/delete responses never include plaintext keys or encrypted payloads. The complete key appears in the browser only in the add form before its one-time POST and is cleared afterward. Each account may save up to ten provider credentials. If `CREDENTIAL_ENCRYPTION_KEY` is missing or malformed, create fails closed with a generic service error; listing existing masked metadata remains available.

## Authorization, validation, and execution

- All routes require a valid, unexpired, unrevoked session. Missing or invalid identity receives `401`.
- Item/graph reads and writes verify both resource ID and authenticated owner ID. A foreign resource is indistinguishable from a missing resource (`404`).
- Credential creation derives ownership from the verified session and encrypts with AES-256-GCM. Deletion filters by both credential ID and owner ID. Credentials are decrypted only during execution after a fresh owner/provider/credential-ID match.
- Every mutation requires a same-origin `Origin` header. Workflow metadata/auth bodies keep the 8 KiB streamed cap; graph `PUT` is streamed with a 512 KiB cap; execution input is streamed with a 16 KiB cap; credential JSON is capped at 4 KiB.
- Graph payloads are strict Zod objects: up to 200 UUID-addressed nodes and 500 connections; category/type pairs must match; positions are finite and bounded; node configuration is validated against a strict category-specific schema. AI node settings include bounded prompts, system instructions, token limits, labels, provider, credential UUID, and provider-specific curated model IDs. User-selected IDs do not bypass server-side ownership verification. OpenAI structured JSON must meet strict closed-object requirements. Arbitrary model IDs, keys, and provider endpoints are rejected.
- Graph replacement verifies ownership, then replaces connections/nodes and updates workflow time inside one Drizzle transaction. Invalid payloads do not reach the database; database failures return generic errors.
- Execution is available only for exactly one Manual Trigger. It loads the owner-checked graph, requires no client-supplied identity, stores a `pending`/`running`/terminal execution record, and writes only privacy-minimized per-node summaries. Execution is capped at 50 graph nodes, 25 executed steps, an eight-second graph budget, and a 16 KiB trigger input. Each AI request is limited to six seconds or the remaining graph budget, whichever is shorter; automatic OpenAI SDK retries are disabled.
- Executable categories are Manual Trigger, Condition, Filter, AI Text Generation, AI Classification, AI Extraction, AI Summarization, AI Generation, HTTP Request, and Webhook Action. Webhook Trigger and Schedule Trigger graphs run only after activation (via `/api/hooks/:token` and the daily Cron tick respectively). Send Email delivers only to the owner's account email (see `workflow-engine.md`). Create/Update Database Record write owner-private JSON records. Switch and Delay remain unsupported.
- The built-in Gemini provider reads `GEMINI_API_KEY` and optional `GEMINI_MODEL_ID` only from the server environment. BYO keys are decrypted server-side using the stable `CREDENTIAL_ENCRYPTION_KEY`, never accepted in workflow graph data, and never returned by the API.
- Outbound workflow actions allow HTTPS port 443 only. Every resolved address must be public unicast and the selected address is pinned; redirects, URL credentials, custom headers, and non-2xx responses are rejected. User-configurable provider URLs are disabled; only fixed official Gemini/OpenAI API endpoints receive credentials.
- Logs keep only safe summaries. Trigger values, prompts, model completions, response bodies, full URLs, keys, ciphertext, SDK exception details, and stack traces are not returned or stored. AI summaries may contain model/usage metadata and output character counts.
- Responses use `Cache-Control: no-store`; database internals and session tokens are not returned or logged. Deleting a workflow with dependent execution history returns `409`; history is not cascaded away.

## Deliberate boundaries

The execution routes run synchronously; no queue, status polling/history browser, retries, rate limiting, background worker, or error branches exist yet. Scheduled runs are idempotent per UTC-midnight slot; manual and webhook runs have no idempotency keys. The webhook receiver and activation API are now implemented, but rate limiting, replay protection, and production abuse controls remain out of scope. Workflow `isActive` gates webhook and scheduled execution only; it does not authorize manual execution. Custom provider implementations can be added behind the server-side interface, but arbitrary user-configured base URLs remain out of scope until credentialed egress receives separate SSRF and secret-exfiltration review. Never put API keys, passwords, or tokens in workflow configuration.

Public outbound HTTPS and AI usage remain potential abuse/cost capabilities. Provider usage is billed to the built-in environment or the user's own vendor account according to the selected key. Production use needs rate limits, provider quota controls, abuse monitoring, and deployment-level egress review.

The interactive sample at `/workflow-preview` uses in-memory sample data and never calls the workflow API; edits in this preview are not saved. The static preview does not execute Netlify Functions, outbound requests, or AI calls. The normal editor and execution route require an authenticated Netlify Function environment and database configuration.

## Operational note

No live Netlify Database or provider API was used during this implementation. Unit tests use deterministic fake providers and injected data. Configure `CREDENTIAL_ENCRYPTION_KEY` as a stable server-side Base64 value generated from 32 random bytes before accepting real BYO credentials, and keep a protected backup; losing it makes stored keys unrecoverable. No live key, paid model request, migration, or deployment was initiated.

## Local checks

```sh
npm run lint
npm test
npm run build
npx drizzle-kit check
```

## Phase 7 webhook trigger

Workflows have a server-generated `webhookToken` and owner-controlled `isActive` state. The token is returned only in metadata responses for the authenticated owner; clients cannot provide or change it. Activating a workflow validates the persisted graph and requires exactly one Webhook Trigger.

`POST /api/hooks/:webhookToken` is a public bearer-token endpoint and does not use a session cookie. It accepts one JSON object body up to 16 KiB, executes only an active workflow whose graph contains exactly one Webhook Trigger, and returns the same safe synchronous execution summary shape used by manual runs. Unknown, malformed, inactive, and wrong-trigger tokens intentionally return the same generic `404 Workflow not found.` response. Invalid bodies do not create executions.

Webhook tokens and raw webhook payloads are never written to execution records, execution logs, generic errors, or server logs. The route revalidates the graph and preserves the existing 50-node, 25-step, eight-second execution bounds. Rate limiting, quotas, abuse monitoring, replay protection, and production egress review remain required before live deployment.

## Phase 7 schedule trigger

Workflows whose single trigger is a Schedule Trigger (`{ frequency: 'daily' }` or `{ frequency: 'weekly', weekdays: [0-6...] }`, UTC) can be activated once their config is complete. A once-daily Vercel Cron job runs due workflows between 00:00 and 00:59 UTC; there is no time-of-day option on the Hobby plan, and missed runs are not retried. Activation returns `409` when 25 scheduled workflows are already active. See [`schedule-trigger.md`](schedule-trigger.md) for the request flow, idempotency, and operations.
