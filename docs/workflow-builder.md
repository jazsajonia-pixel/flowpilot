# Visual Workflow Builder

Phase 3 adds a React Flow (`@xyflow/react`) editor for workflow nodes and connections. The normal editor route is `/workflows/:workflowId/edit`; the surrounding workflow list is available at `/workflows`.

## Editor behavior

- The node library groups the catalog into Triggers, AI, Logic, and Actions. Desktop users can drag a library item onto the canvas; items can also be clicked to add them at the canvas center.
- Custom node cards show their category and connection handles. The inspector edits Phase 4 settings for Conditions, Filters, HTTP Requests, and Webhook Actions, plus AI settings for text generation, classification, extraction, summarization, and generation.
- Each AI node can select Gemini or OpenAI, a curated vendor-specific model, and either a masked user-owned credential or the server-managed Gemini default. The browser receives only credential IDs, labels, providers, timestamps, and a fixed mask; API keys are never returned after saving.
- AI settings include bounded prompt templates, optional system instructions, output limits, JSON mode/JSON Schema, classification labels, extraction schema, and summary style. OpenAI JSON Schema mode requires an object root, all properties listed in `required`, and `additionalProperties: false` on every object. Gemini structured output is validated locally against its configured schema.
- Node configuration stores a credential ID, not a key. The execution function rechecks that the ID belongs to the signed-in user and matches the selected provider before decrypting it. Arbitrary custom provider URLs are not accepted.
- Users can move/delete nodes, create/delete edges, and save the workflow name. Graph changes auto-save after a short pause, with a visible save state, manual save, and retry on failure.
- A workflow may have at most one trigger. Trigger nodes have no inbound handle. Self-links, duplicate links, links to missing nodes, inbound links to triggers, and cycles are rejected by both UI and server validation. Condition nodes expose True and False handles plus an unconditional compatibility output.
- The Run dialog accepts a JSON object for a Manual Trigger. A run is explicitly started by the signed-in user after unsaved graph changes are saved. Results show execution/node status and safe metadata only, not prompts, completions, or raw HTTP content.

## Graph persistence and execution

The editor loads metadata from `GET /api/workflows/:workflowId` and graph state from `GET /api/workflows/:workflowId/graph`. `PUT /api/workflows/:workflowId/graph` sends the full node/connection set. The server verifies the session and owner before access, validates strict UUID-based payloads and per-category node settings, and replaces the graph in a Drizzle transaction. Graph limits are 200 nodes, 500 connections, 512 KiB per graph request, and finite canvas coordinates from -100,000 to 100,000.

`POST /api/workflows/:workflowId/executions` runs an owned workflow synchronously from one Manual Trigger. Phase 4 supports Condition, Filter, HTTPS HTTP Request, and HTTPS Webhook Action; Phase 5/6 support the five AI node categories. Each run is capped at 50 graph nodes, 25 executed steps, an eight-second graph budget, and a 16 KiB trigger input. AI calls are capped at six seconds, 16,384-character prompt text, 2,048 output tokens, and bounded JSON Schema/output sizes. The static sample preview is not connected to this API. See [`workflow-engine.md`](workflow-engine.md) and [`workflow-api.md`](workflow-api.md) for runtime and security details.

Credential keys are encrypted by authenticated server endpoints using `CREDENTIAL_ENCRYPTION_KEY`; this must be a stable, server-only Base64 value generated from 32 random bytes. The API never returns plaintext keys or stored ciphertext. If the master key is lost, existing keys cannot be decrypted. No live database or provider call was used during the Phase 6 implementation.

Webhook/schedule triggers, email/database actions, retries, background workers, rate limiting, and arbitrary custom provider endpoints are not implemented. Public outbound calls are user-initiated and restricted to HTTPS on port 443 with DNS/IP pinning and size/time caps. BYO provider charges are billed by the vendor to the selected key's account; per-user quotas and abuse controls remain later work.

## Preview and development

`/workflow-preview` renders a sample graph entirely in browser memory. It is interactive but clearly marked and never saves sample changes, calls the workflow API, or makes outbound/AI provider requests. A static Vite preview cannot execute Netlify Functions. To test persistence and execution, use Netlify Dev with a configured database and server-only credentials.

Run `npm run lint`, `npm test`, `npm run build`, and `npx drizzle-kit check` before publishing changes.
