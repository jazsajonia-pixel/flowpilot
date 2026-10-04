# Protected Workflow API

Phase 2D introduced workflow metadata routes. Phase 3 adds graph read/write. Phase 4 adds a user-initiated manual execution route, and Phase 5 adds server-side Gemini-backed AI nodes to the same execution path. Every endpoint derives identity from the Phase 2C opaque session cookie; clients cannot choose or change `ownerId`.

## Routes

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/workflows` | List only the authenticated user's workflows, newest update first. | `200 { workflows: [...] }` |
| `POST` | `/api/workflows` | Create an inactive workflow for the authenticated user. Accepts `title` and optional `description`. | `201 { workflow: ... }` |
| `GET` | `/api/workflows/:workflowId` | Read one workflow only when its ID and owner both match the session. | `200 { workflow: ... }` |
| `PATCH` | `/api/workflows/:workflowId` | Update only `title` and/or `description`, scoped by workflow ID and session owner. | `200 { workflow: ... }` |
| `DELETE` | `/api/workflows/:workflowId` | Delete only an owned workflow. Execution history is preserved by a restrictive foreign key. | `200 { ok: true }` |
| `GET` | `/api/workflows/:workflowId/graph` | Read the owned workflow's nodes and connections. | `200 { graph: { nodes, connections } }` |
| `PUT` | `/api/workflows/:workflowId/graph` | Atomically replace an owned workflow's complete graph. | `200 { ok: true }` |
| `POST` | `/api/workflows/:workflowId/executions` | Start one synchronous manual execution with `{ input?: { ... } }`. | `200 { execution: { id, workflowId, status, logs, ... } }` |

## Authorization, validation, and execution

- All routes require a valid, unexpired, unrevoked session. Missing or invalid identity receives `401`.
- Item/graph reads and writes first verify both the workflow ID and authenticated owner ID. Another user's workflow is indistinguishable from a missing workflow (`404`). Execution creation repeats the same owner check before loading nodes and connections.
- Creation derives owner identity from the verified session. Request schemas reject unknown fields such as `ownerId`, `id`, and `isActive` where they are not editable.
- Every mutation requires a same-origin `Origin` header. Metadata/auth bodies keep the 8 KiB streamed cap; graph `PUT` is streamed with a 512 KiB cap; execution input is streamed with a 16 KiB cap.
- Graph payloads are strict Zod objects: up to 200 UUID-addressed nodes and 500 connections; category/type pairs must match; positions are finite and bounded; node configuration is validated against a strict category-specific schema. AI node settings have bounded prompts, system instructions, token limits, labels, and JSON Schema input. Credentials, custom model selection, and arbitrary provider fields are rejected. A graph may have at most one trigger. Connections must reference nodes in that graph and cannot self-link, duplicate, point into a trigger, or create a directed cycle.
- Graph replacement verifies ownership, then replaces connections/nodes and updates workflow time inside one Drizzle transaction. Invalid payloads do not reach the database; database failures return generic errors.
- Execution is available only for exactly one Manual Trigger. It loads the owner-checked persisted graph, requires no client-supplied identity, stores a `pending`/`running`/terminal execution record, and writes only privacy-minimized per-node summaries. Execution is capped at 50 graph nodes, 25 executed steps, an eight-second graph budget, and a 16 KiB trigger input. A Gemini request is limited to six seconds or the remaining graph budget, whichever is shorter.
- Executable categories are Manual Trigger, Condition, Filter, Gemini AI, AI Classification, AI Extraction, AI Summarization, AI Generation, HTTP Request, and Webhook Action. Webhook/Schedule triggers, Switch, Delay, email, and database actions remain unsupported.
- The built-in Gemini provider reads `GEMINI_API_KEY` and optional `GEMINI_MODEL_ID` only from the server environment. Provider credentials are never accepted in a graph or returned by an API. User-managed/BYO credentials and model selection are Phase 6 work.
- Outbound actions allow HTTPS port 443 only. Every resolved address must be public unicast and the selected address is pinned; redirects, URL credentials, custom headers, and non-2xx responses are rejected. Request/response bodies are capped at 32/64 KiB, and the node does not persist raw request or response payloads.
- Logs keep only safe summaries. Trigger values, prompts, model completions, response bodies, full URLs, SDK exception details, and stack traces are not returned or stored. AI summaries may contain model/usage metadata and output character counts; external non-2xx failures include the status number only.
- Responses use `Cache-Control: no-store`; database internals and session tokens are not returned or logged. Deleting a workflow with dependent execution history returns `409`; history is not cascaded away.

## Deliberate boundaries

The editor supports settings for the Phase 4 logic/action nodes and Phase 5 AI nodes. The execution route runs synchronously; no queue, status polling/history browser, retries, idempotency keys, rate limiting, background worker, scheduler, webhook receiver, error branches, or workflow activation API exists yet. Workflow `isActive` is not an execution authorization or scheduling control. The built-in Gemini API key is configured outside the application in the server environment; user key encryption and BYO provider support remain later work. Never put API keys, passwords, or tokens in workflow configuration.

Public outbound HTTPS and shared built-in AI usage are deliberate but potentially abusable capabilities. Production use needs rate limits, provider quota/billing controls, abuse monitoring, and deployment-level egress review in addition to the SSRF checks implemented here.

The interactive sample at `/workflow-preview` uses in-memory sample data and never calls the workflow API; edits in this preview are not saved. The static preview does not execute Netlify Functions, outbound requests, or Gemini calls. The normal editor and execution route require an authenticated Netlify Function environment, database configuration, and (for AI nodes) `GEMINI_API_KEY`.

## Operational note

No live Netlify Database was available during this implementation. The Phase 2B/2C migrations and Phase 4/5 execution path were not applied or exercised against a live database, and no deployment or live Gemini request was initiated. Unit tests inject a fake AI provider. Use Netlify Dev with the database environment configured to exercise real API persistence; configure a server-side Gemini key only when ready to run a real provider call.

## Local checks

```sh
npm run lint
npm test
npm run build
npx drizzle-kit check
```
