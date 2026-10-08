# FlowPilot Workflow Engine

This document describes the implemented Phase 4 and Phase 5 runtime plus Phase 6 BYO provider integration. The editor can save a larger catalog than the engine can run; only the explicitly supported nodes below are executable today.

## Execution flow

A signed-in owner starts a workflow manually from the editor. The server checks same-origin intent and workflow ownership, validates the stored graph, requires exactly one Manual Trigger, persists an execution row, evaluates the graph in topological order, stores step summaries, and returns the final status. Execution does not run merely because a workflow is saved or marked active.

The runner processes each graph node at most once. Nodes with no active incoming edge are logged as skipped. A Condition activates only its matching `true` or `false` output edge; the older `out` handle is retained as an unconditional path for graphs saved before Phase 4. Cycles and invalid graph references are rejected. AI provider calls occur only when an AI node is reached during an explicitly started run.

## Executable nodes

| Category | Behavior |
|---|---|
| Manual Trigger | Starts a user-initiated run with a JSON object as `trigger` data. |
| Webhook Trigger | Starts an active workflow from `POST /api/hooks/:token`; the JSON body is `trigger` data. |
| Schedule Trigger | Starts an active workflow from the daily Cron tick; `trigger` is `{ scheduledAt, frequency }`. Daily or weekly (UTC weekdays) only. |
| Condition | Compares values using equals, not-equals, contains, not-contains, numeric greater/less-than, is-empty, and is-not-empty. True/False handles route the graph. |
| Filter | Keeps array entries whose configured item field meets one of those comparison operators. The result is exposed as `steps.<node-uuid>.items` and `.count`. |
| AI Text Generation (`gemini_ai`) | Sends a templated prompt to the selected Gemini provider. Supports text or bounded JSON mode with an optional JSON Schema. |
| AI Classification | Classifies input against 2–40 configured labels and validates the returned `{ label, confidence }` object. |
| AI Extraction | Extracts fields using a configured JSON Schema; parsed output is checked locally against that schema. |
| AI Summarization | Produces a text summary in brief, detailed, or bullet style. |
| AI Generation | Produces text from a prompt and optional system instruction. |
| HTTP Request | GET, POST, PUT, PATCH, or DELETE over restricted outbound HTTPS. GET/DELETE have no request body; other methods may send a JSON body. |
| Webhook Action | Sends an outgoing HTTPS POST with an optional JSON body. |
| Send Email | Sends a plain-text email to the workflow owner's account email only, with templated `subject` and `body`. See "Email notifications" below. |

AI nodes share the `AIProvider` interface. Gemini can use the built-in server-managed `GEMINI_API_KEY` or a user-owned Gemini credential. OpenAI requires a user-owned OpenAI credential. Credential IDs and curated model IDs are stored with the workflow; plaintext keys are not. The engine resolves each key only after matching credential ID, provider, and owner ID to the signed-in session, then decrypts it in the server function. OpenAI calls use the official Responses API; OpenAI JSON Schema mode requires an object root, every object property in `required`, and `additionalProperties: false` on every object. Arbitrary endpoint URLs are not accepted. Custom adapters remain a code-level extension point, not user-configurable remote URLs.

`GEMINI_MODEL_ID` can override the built-in provider default (`gemini-3.8-flash`) in the server environment. BYO nodes use a provider-specific allowlist; the current defaults are Gemini 3.8 Flash and GPT-6 Luna. Model catalogs are maintained in `src/types/ai.ts`. Provider credentials and model APIs are not called during graph save or preview.

## Execution context and templates

The manual input object is available under `trigger`. A node result is stored internally under `steps.<node-uuid>`. Filter evaluation also exposes the current record as `item` internally. Templates use expressions such as `{{trigger.body.status}}`, `{{steps.<node-uuid>.result}}`, and `{{steps.<node-uuid>.items}}`. A whole-string template preserves its JSON type; templates embedded in a larger string are stringified. AI nodes return their text or parsed JSON value at `.result`, so a later node can reference `{{steps.<ai-node-uuid>.result}}` or a nested field such as `{{steps.<ai-node-uuid>.result.label}}`.

HTTP/webhook request bodies are configured as JSON text. The engine parses JSON first, resolves templates in its values, then serializes the resulting JSON. Template path traversal is own-property-only and rejects prototype-related path segments.

## Limits and outbound safeguards

- At most 50 graph nodes are eligible for a manual run; at most 25 nodes can execute in one run.
- The overall graph budget is eight seconds. Each AI request is cancelled after at most six seconds or the remaining graph budget, whichever is shorter. The OpenAI SDK has automatic retries disabled. Cancellation may not stop provider-side work that has already been accepted.
- AI prompt inputs are capped at 16,384 characters, system instructions at 4,096 characters, configured JSON Schema at 8,192 characters, generated output at 2,048 tokens, and returned text at 65,536 characters. Manual input is capped at 16 KiB.
- Outbound request and response bodies are capped at 32 KiB and 64 KiB respectively. URL length is capped at 2,048 characters.
- Outbound requests must use HTTPS on port 443, without embedded URL credentials. IP literals and every DNS A/AAAA answer must classify as public unicast. The selected public address is pinned to the connection while TLS verification and hostname SNI remain enabled.
- Redirects are not followed. User-supplied headers and credentials are not supported for workflow HTTP actions. Non-2xx responses fail the action.
- The runner does not make requests during graph save or preview. An outbound or AI-provider call happens only when the signed-in user explicitly starts a run.

## Persistence and privacy

An `executions` record transitions through `pending` → `running` → `completed` or `failed`. An `execution_logs` row records the node UUID, status, timestamp, and limited safe metadata. Trigger data persists only a received flag and field count; node logs do not persist prompts, trigger values, AI completions, raw HTTP bodies, full URLs, provider error bodies, or exception stacks. AI log summaries may include the model identifier, output type and character count, and provider-reported token counts. Only fixed, content-free provider errors may be logged.

BYO keys are encrypted at rest in `credentials.encrypted_payload` with AES-256-GCM. `CREDENTIAL_ENCRYPTION_KEY` must be a stable, server-only Base64 encoding of 32 random bytes. The encrypted envelope is authenticated against the credential ID, owner ID, and provider. List/create APIs return masked metadata only; key bytes are never returned after creation. Losing the master key makes existing stored keys unrecoverable. No plaintext keys, encryption key, prompts, or provider responses are logged.

AI results remain in the in-memory execution context for downstream nodes; the manual execution response returns status and safe logs, not raw AI output. Tests inject fake providers; no live Gemini/OpenAI key or paid model request was used during implementation. If a required provider credential or vault master key is missing, the node fails safely without exposing secrets or SDK error details.

## Reliability and production boundary

Manual, webhook, and scheduled executions are synchronous and bounded rather than queued. Webhook runs require an active workflow with exactly one Webhook Trigger and a valid public bearer token; scheduled runs require an active workflow with exactly one complete Schedule Trigger and are started only by the authenticated daily Cron tick (see [`schedule-trigger.md`](schedule-trigger.md)); manual runs remain restricted to Manual Trigger graphs. Their graph budget leaves time for response/database work within an ordinary serverless invocation; long-running workflows need a durable queue/background design in a later phase. External public-endpoint actions, the public webhook route, and user-owned model usage remain potential abuse/cost surfaces. Rate limits, per-user quotas, abuse monitoring, execution history UI, retry support, idempotency for non-scheduled runs, and deployment-level egress controls are not implemented. Arbitrary custom provider URLs remain disabled until credentialed outbound egress receives a dedicated SSRF and credential-exfiltration review. Do not enable production execution until the deployment environment, database migrations, provider billing controls, rate limits, and abuse monitoring have been reviewed.

## Email notifications

The Send Email action (`send_email`) accepts only `{ subject?, body? }` templates; there is no recipient field. Messages are delivered to the workflow owner's account email, so public webhook or scheduled triggers cannot send mail to third parties.

- **Provider:** Resend's HTTPS API (`https://api.resend.com/emails`) called with `fetch`, no SDK dependency. Server-only `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified in Resend) enable it. If either is missing, Send Email nodes fail with `Email notifications are not configured on this server.` and nothing is sent.
- **Limits:** rendered subject 1–200 characters (control characters removed), body 1–10,000 characters; at most 3 emails per run and 20 successful sends per owner per rolling 24 hours (counted from `execution_logs`); each request times out after at most 2.5 s within the run budget; redirects are rejected.
- **Privacy:** logs record only `{ sent: true }`. Addresses, subjects, bodies, and provider responses are never logged or returned; provider failures map to fixed messages.
- **Known gaps:** account emails are not verified yet, so a user could register with someone else's address and email it within the daily cap. Email verification and sender-reputation monitoring belong to Phase 9 hardening.

