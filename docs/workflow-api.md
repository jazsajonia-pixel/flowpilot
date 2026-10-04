# Phase 2D — Protected Workflow API

Phase 2D adds a server-side API for workflow metadata. Every route derives the caller's identity from the Phase 2C opaque session cookie; clients cannot choose or change `ownerId`.

## Routes

| Method | Path | Purpose | Success |
|---|---|---|---|
| `GET` | `/api/workflows` | List only the authenticated user's workflows, newest update first. | `200 { workflows: [...] }` |
| `POST` | `/api/workflows` | Create an inactive workflow for the authenticated user. Accepts `title` and optional `description`. | `201 { workflow: ... }` |
| `GET` | `/api/workflows/:workflowId` | Read one workflow only when its ID and owner both match the session. | `200 { workflow: ... }` |
| `PATCH` | `/api/workflows/:workflowId` | Update only `title` and/or `description`, scoped by workflow ID and session owner. | `200 { workflow: ... }` |
| `DELETE` | `/api/workflows/:workflowId` | Delete only an owned workflow. Execution history is preserved by a restrictive foreign key. | `200 { ok: true }` |

## Security behavior

- All routes require a valid, unexpired, unrevoked session. Missing or invalid identity receives `401`.
- Item reads, updates, and deletes include **both** the workflow ID and authenticated owner ID in the database predicate. A workflow owned by someone else is indistinguishable from a missing workflow (`404`).
- Creation takes its owner ID from the verified session. Request schemas reject unknown fields such as `ownerId`, `id`, and `isActive`.
- Mutations require a same-origin `Origin`. `POST` and `PATCH` bodies are Zod-validated and streamed with an 8 KiB cap; `DELETE` accepts no client-supplied resource fields. Responses use `Cache-Control: no-store`.
- Deleting a workflow that has dependent execution history returns `409`; the history is not cascaded away.
- Database failures return a generic `503`; internal details and user tokens are not returned or logged.

## Deliberate boundaries

This API manages metadata only. It does not read or write graph nodes/connections, activate workflows, run workflows, or protect placeholder frontend pages. Phase 3 builds graph editing; execution and trigger behavior are later phases. The browser UI is not an authorization boundary. Future endpoints for integrations, credentials, executions, or logs must also use the verified request user and owner-scoped database access (for executions, via the owning workflow).

Login and registration remain public and still require rate limiting and breached-password screening before public production signup. No live Netlify Database was available here, so the Phase 2C migration has not been applied and live API/database integration has not been exercised. Use Netlify Dev with the database environment configured to exercise these routes; the temporary static preview does not execute Netlify Functions.

## Local checks

```sh
npm run lint
npm test
npm run build
npx drizzle-kit check
```
