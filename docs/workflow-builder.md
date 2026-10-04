# Visual Workflow Builder

Phase 3 adds a React Flow (`@xyflow/react`) editor for workflow nodes and connections. The normal editor route is `/workflows/:workflowId/edit`; the surrounding workflow list is available at `/workflows`.

## Editor behavior

- The node library groups the catalog into Triggers, AI, Logic, and Actions. Desktop users can drag a library item onto the canvas; items can also be clicked to add them at the canvas center.
- Custom node cards show their category and connection handles. The inspector edits a selected node's label and Phase 4 settings for Conditions, Filters, HTTP Requests, and Webhook Actions. Other node settings are deferred to later phases.
- Users can move/delete nodes, create/delete edges, and save the workflow name. Graph changes auto-save after a short pause, with a visible save state, manual save, and retry on failure.
- A workflow may have at most one trigger. Trigger nodes have no inbound handle. Self-links, duplicate links, links to missing nodes, inbound links to triggers, and cycles are rejected by both UI and server validation. Condition nodes expose True and False handles plus an unconditional compatibility output.
- The Run dialog accepts a JSON object for a Manual Trigger. A run is explicitly started by the signed-in user after unsaved graph changes are saved. Results show only execution/node status summaries, not raw HTTP content.

## Graph persistence and execution

The editor loads metadata from `GET /api/workflows/:workflowId` and graph state from `GET /api/workflows/:workflowId/graph`. `PUT /api/workflows/:workflowId/graph` sends the full node/connection set. The server verifies the session and owner before access, validates strict UUID-based payloads and per-category node settings, and replaces the graph in a Drizzle transaction. Graph limits are 200 nodes, 500 connections, 512 KiB per graph request, and finite canvas coordinates from -100,000 to 100,000.

`POST /api/workflows/:workflowId/executions` runs an owned workflow synchronously from one Manual Trigger. Phase 4 supports Condition, Filter, HTTPS HTTP Request, and HTTPS Webhook Action nodes only. Each run is capped at 50 graph nodes, 25 executed steps, a five-second graph budget, and a 16 KiB trigger input. The static sample preview is not connected to this API. See [`workflow-engine.md`](workflow-engine.md) and [`workflow-api.md`](workflow-api.md) for runtime and security details.

Credentials, custom request headers, AI nodes, webhook/schedule triggers, email/database actions, retries, background workers, and rate limiting are not implemented. Public outbound calls are user-initiated and restricted to HTTPS on port 443 with DNS/IP pinning and size/time caps, but production execution still requires abuse controls and deployment-level egress review.

## Preview and development

`/workflow-preview` renders a sample graph entirely in browser memory. It is interactive but clearly marked and never saves sample changes, calls the workflow API, or makes outbound requests. A static Vite preview cannot execute Netlify Functions. To test persistence and execution, use Netlify Dev with a configured database; no live database was available during Phase 4 implementation.

Run `npm run lint`, `npm test`, `npm run build`, and `npx drizzle-kit check` before publishing changes.
