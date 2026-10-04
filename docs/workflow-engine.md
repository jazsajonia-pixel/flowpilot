# FlowPilot Workflow Engine

This document describes the implemented Phase 4 execution contract. The editor can save a larger catalog than the engine can run; only the explicitly supported nodes below are executable today.

## Execution flow

A signed-in owner starts a workflow manually from the editor. The server checks same-origin intent and workflow ownership, validates the stored graph, requires exactly one Manual Trigger, persists an execution row, evaluates the graph in topological order, stores step summaries, and returns the final result. Execution does not run merely because a workflow is saved or marked active.

The runner processes each graph node at most once. Nodes with no active incoming edge are logged as skipped. A Condition activates only its matching `true` or `false` output edge; the older `out` handle is retained as an unconditional path for graphs saved before Phase 4. Cycles and invalid graph references are rejected.

## Phase 4 node support

| Category | Behavior |
|---|---|
| Manual Trigger | Starts a user-initiated run with a JSON object as `trigger` data. |
| Condition | Compares values using equals, not-equals, contains, not-contains, numeric greater/less-than, is-empty, and is-not-empty. True/False handles route the graph. |
| Filter | Keeps array entries whose configured item field meets one of those comparison operators. The result is exposed as `steps.<node-uuid>.items` and `.count`. |
| HTTP Request | GET, POST, PUT, PATCH, or DELETE over restricted outbound HTTPS. GET/DELETE have no request body; other methods may send a JSON body. |
| Webhook Action | Sends an outgoing HTTPS POST with an optional JSON body. |

The Webhook Trigger and Schedule Trigger are not implemented here; they are Phase 7. AI nodes are Phase 5. Switch, Delay, email, and database actions are later work. If a reachable unsupported node is encountered, the run fails safely at that step.

## Execution context and templates

The manual input object is available under `trigger`. A node result is stored under `steps.<node-uuid>`. Filter evaluation also exposes the current record as `item` internally. Templates use expressions such as `{{trigger.body.status}}`, `{{steps.<node-uuid>.result}}`, and `{{steps.<node-uuid>.items}}`. A whole-string template preserves its JSON type; templates embedded in a larger string are stringified.

HTTP/webhook request bodies are configured as JSON text. The engine parses JSON first, resolves templates in its values, then serializes the resulting JSON. Template path traversal is own-property-only and rejects prototype-related path segments.

## Limits and outbound safeguards

- At most 50 graph nodes are eligible for a manual run; at most 25 nodes can execute in one run.
- Graph evaluation has a five-second budget. Each outbound request shares a maximum 2.5-second budget with DNS resolution and connection/response processing.
- Manual input is capped at 16 KiB. Outbound request and response bodies are capped at 32 KiB and 64 KiB respectively. URL length is capped at 2,048 characters.
- Outbound requests must use HTTPS on port 443, without embedded URL credentials. IP literals and every DNS A/AAAA answer must classify as public unicast. The selected public address is pinned to the connection while TLS verification and hostname SNI remain enabled.
- Redirects are not followed. User-supplied headers and credentials are not supported. Non-2xx responses fail the action.
- The runner does not make requests during graph save or preview. An outbound call happens only when the signed-in user explicitly starts a run.

## Persistence and privacy

An `executions` record transitions through `pending` → `running` → `completed` or `failed`. A row in `execution_logs` records the node UUID, status, timestamp, and limited safe metadata. Trigger data persists only a received flag and field count; node logs persist category/result/count/status/response-size summaries, not raw trigger data, HTTP bodies, response bodies, URLs, or exception stacks. Error text is generic except for a numeric external HTTP status code.

Execution history is stored in the database, but a full execution-history browser, status polling, retries, idempotency keys, queue/background workers, rate limiting, error branches, credential vault integration, and deployment monitoring are not part of Phase 4. A completed response is returned to the editor for immediate feedback; no live database was available for an integration run during this implementation.

## Reliability and production boundary

Manual executions are synchronous and bounded rather than queued. Their graph budget leaves time for request/database work within an ordinary serverless invocation; long-running workflows need a durable background/queue design in a later phase. External public-endpoint actions remain a potential abuse surface without rate limits and deployment-level egress controls. Do not enable production execution until the deployment environment, database migrations, rate limits, and abuse monitoring have been reviewed.
