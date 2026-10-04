# Protected Workflow API

Phase 2D introduced workflow metadata routes. Phase 3 adds graph read/write routes. Every endpoint derives identity from the Phase 2C opaque session cookie; clients cannot choose or change `ownerId`.

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

## Security and graph validation

- All routes require a valid, unexpired, unrevoked session. Missing or invalid identity receives `401`.
- Item/graph reads and writes first verify both the workflow ID and the authenticated owner ID. Another user's workflow is indistinguishable from a missing workflow (`404`).
- Creation derives owner identity from the verified session. Request schemas reject unknown fields such as `ownerId`, `id`, and `isActive` where they are not editable.
- Every mutation requires a same-origin `Origin` header. Metadata/auth bodies keep the 8 KiB streamed cap; graph `PUT` is streamed with a 512 KiB cap.
- Graph payloads are strict Zod objects: up to 200 UUID-addressed nodes and 500 connections; category/type pairs must match; positions are finite and bounded; node configuration must remain empty in this phase. A graph may have at most one trigger. Connections must reference existing nodes in that same graph and cannot self-link, duplicate, point into a trigger, or create a directed cycle.
- Graph replacement verifies ownership and then deletes/re-inserts connections and nodes plus updates workflow time inside one Drizzle transaction. Invalid payloads do not reach the database; database failures return a generic `503`.
- Responses use `Cache-Control: no-store`; internal database details and session tokens are not returned or logged.
- Deleting a workflow that has dependent execution history returns `409`; the history is not cascaded away.

## Deliberate boundaries

The editor persists graph structure and positions only. It does not activate or execute workflows, implement node-specific settings, store credentials, protect other placeholder UI pages, or provide resource-specific APIs for future integrations/executions/logs. The browser UI is not an authorization boundary. Execution and trigger behavior are Phase 4; credential encryption remains a later phase. Do not place API keys, passwords, or tokens in workflow configuration.

The interactive sample at `/workflow-preview` uses in-memory sample data and never calls the workflow API; edits in this preview are not saved. The regular editor requires an authenticated Netlify Function environment and configured database.

## Operational note

No live Netlify Database was available during implementation, so the earlier authentication migration remains unapplied here and graph/API behavior was not exercised against a live database. Use Netlify Dev with the database environment configured to exercise the real routes. The temporary static preview does not execute Netlify Functions.

## Local checks

```sh
npm run lint
npm test
npm run build
npx drizzle-kit check
```
