# Phase 3 — Visual Workflow Builder

Phase 3 adds a React Flow (`@xyflow/react`) editor for the existing workflow/node/connection tables. The normal editor route is `/workflows/:workflowId/edit`; the surrounding workflow list is available at `/workflows`.

## Editor behavior

- The node library groups the current catalog into Triggers, AI, Logic, and Actions. Desktop users can drag a library item onto the canvas; every item can also be tapped/clicked to add it at the canvas center, including on touch devices.
- Custom node cards show their category, distinct group color, and connection handles. The inspector edits a selected node's label and shows its type, category, and position. Node-specific settings are intentionally deferred; the API accepts an empty `config` object only.
- Users can move and delete nodes, create/delete edges, and save the workflow name. Graph changes auto-save after a short pause, with a visible save state, manual save button, and retry on failure.
- A workflow allows at most one trigger. Trigger nodes have no inbound handle. Self-links, duplicate links, links to missing nodes, inbound links to triggers, and cycles are rejected by the UI and independently revalidated by the server.

## Graph persistence

The editor loads metadata from `GET /api/workflows/:workflowId` and graph state from `GET /api/workflows/:workflowId/graph`. `PUT /api/workflows/:workflowId/graph` sends the full node/connection set. The server verifies the session and owner before access, validates strict UUID-based payloads, and replaces the graph in a single Drizzle transaction. Limits are 200 nodes, 500 connections, 512 KiB per graph request, and finite canvas coordinates from -100,000 to 100,000.

Graph configuration remains empty: this phase does not include prompts, HTTP headers, integration settings, credentials, activation, or execution. Never store secrets in graph data; credential storage/encryption is a later feature. A connected node graph is not yet executable until Phase 4.

## Preview and development

`/workflow-preview` renders a sample graph entirely in browser memory. It is interactive but clearly marked and never saves sample changes or calls the protected API. To test real persistence, run the application through Netlify's local function environment with the database configured; a static Vite preview cannot execute Netlify Functions.

Run `npm run lint`, `npm test`, `npm run build`, and `npx drizzle-kit check` before publishing changes.
