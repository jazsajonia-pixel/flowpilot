# FlowPilot AI — System Architecture

This document describes the high-level system architecture, component layout, and data flow for FlowPilot AI.

---

## 1. System Overview

FlowPilot AI is a modern visual workflow automation platform. Users construct automated workflows using a node-based visual graph editor. Workflows execute triggers, logic conditions, database operations, external integrations, and AI tasks via pluggable AI providers.

```
FlowPilot AI
│
├── Frontend (React / Vite / React Flow / Tailwind / shadcn/ui)
│   ├── Dashboard
│   ├── Visual Workflow Builder
│   ├── Workflow Templates
│   ├── Execution History & Logs
│   ├── AI Provider Management
│   ├── Integrations Hub & Connected Apps
│   └── User Settings
│
├── API Layer (REST / Vercel Function + bundled dispatcher)
│   ├── Authentication & Authorization
│   ├── Workflows Management API
│   ├── Execution Logs API
│   ├── Internal AI Provider Interface (server-side)
│   ├── Integrations Gateway (OAuth account lifecycle)
│   └── Owner-Scoped AI Credentials API
│
├── Workflow Execution Engine
│   ├── Trigger System (Manual, Webhook, Schedule)
│   ├── Node Execution Graph
│   ├── Conditions Engine (IF, Switch, Filter, Delay)
│   ├── Context & Data Passing System
│   ├── Error Handling & Retry Logic
│   └── Execution Logging Subsystem
│
├── AI Provider Layer (Abstraction)
│   ├── Built-in FlowPilot Gemini Provider
│   ├── BYO Gemini/OpenAI providers (server-side)
│   └── Custom provider adapters (code-level extension point)
│
└── Database Layer (Neon PostgreSQL / Drizzle ORM)
    ├── Users & Auth
    ├── Workflows & Templates
    ├── Nodes & Connections
    ├── Executions & Step Logs
    ├── Credentials (Encrypted AI and OAuth payloads)
    ├── Integrations (Owner-scoped connected accounts)
    ├── OAuth state (one-time, expiring transactions)
    └── Webhooks
```

---

## 2. Component Architecture

### 2.1 Frontend Architecture
- **Framework:** React with TypeScript, bundled by Vite.
- **Routing:** `react-router-dom` for client-side navigation.
- **State Management & Data Fetching:** TanStack Query (`@tanstack/react-query`) for API querying, caching, and optimistic updates.
- **Form Management:** `react-hook-form` paired with `zod` for type-safe schema validation.
- **UI & Styling:** Tailwind CSS, shadcn/ui component patterns, and `lucide-react` icons.
- **Visual Graph Editor:** `@xyflow/react` (React Flow) for interactive node connection, drag-and-drop workflow construction, and node inspection.

### 2.2 API & Serverless Backend
- **Platform:** Vercel. `api/dispatch.ts` (all `/api/*` paths are rewritten to it in `vercel.json`) is a single Node serverless function that loads `server-build/dispatcher.mjs`, an esbuild bundle of `vercel/dispatcher.ts`; the dispatcher routes `/api/*` paths to handlers in `src/server/vercel-functions/`. The `netlify/functions/` files are legacy entry points kept for reference. A once-daily Vercel Cron job calls `/api/internal/schedule-tick` (see [`schedule-trigger.md`](schedule-trigger.md)).
- **Validation:** Server-side request parsing and validation using Zod.
  - **Security:** Phase 2C establishes server-side email/password authentication and revocable cookie sessions. Phases 2D and 3 protect workflow metadata and graph endpoints with owner-scoped queries. Phase 4 requires the same owner check to create executions and limits outbound requests to public HTTPS. Phase 6 adds encrypted AI credentials. The OAuth foundation adds exact-provider allowlisting, one-time state and browser binding, initiating-session revalidation, PKCE where supported, encrypted owner-bound token bundles, server-side refresh, and owner-scoped disconnect. Native workflow actions for Gmail, Slack, and Airtable are not implemented by the OAuth account layer. Public endpoint abuse controls and per-user provider quotas remain later work. Node 22 is pinned through `.nvmrc`.

### 2.3 Database Layer (Server-Side Serverless Access)
```
React Frontend
      │ (HTTPS REST API / JSON)
      ▼
Vercel Function (bundled dispatcher)
      │
      ▼
Drizzle ORM (drizzle-orm/neon-http)
      │
      ▼
Neon PostgreSQL (production project / staging project for Preview)
```
- **Driver:** Server-side database operations use `drizzle-orm/neon-http` over `@neondatabase/serverless`, configured by the server-only `DATABASE_URL`. This HTTP driver does not support interactive transactions (`db.transaction` always throws); multi-statement writes must use `db.batch([...])` or a single conditional SQL statement.
- **Strict Boundary:** Database access logic (`src/db/`) is restricted exclusively to server-side API handlers.
- **Zero Client Exposure:** Database credentials and connection strings are never exposed to Vite client bundles or React UI code.
- **Provider Secret Boundary:** `GEMINI_API_KEY`, provider OAuth client secrets, and `CREDENTIAL_ENCRYPTION_KEY` are server-only environment variables and are never exposed to Vite. User BYO AI keys and OAuth access/refresh token bundles are encrypted with AES-256-GCM in `credentials.encrypted_payload`; graph configuration stores only safe IDs. Management API responses never contain plaintext keys, tokens, or ciphertext. OAuth metadata in `integrations.settings` never contains credential material.
- **Schema & Migrations:** Managed with Drizzle ORM and `drizzle-kit`, configured with migration outputs under `netlify/database/migrations/`. Phase 2B defines core entities; Phase 2C adds password-hash/session storage; Phases 2D and 3 provide owner-scoped metadata/graph access; Phase 4 uses the existing execution and execution-log tables; migration `0005_oauth_state` adds expiring one-time OAuth transaction storage and one OAuth credential per integration. See [`database-schema.md`](database-schema.md), [`authentication.md`](authentication.md), [`oauth-provider-setup.md`](oauth-provider-setup.md), [`workflow-api.md`](workflow-api.md), [`workflow-builder.md`](workflow-builder.md), and [`workflow-engine.md`](workflow-engine.md) for data and security boundaries.
- **Environments:** Vercel Production uses the `flowpilot-production` Neon project; Preview uses `flowpilot-staging`. `DATABASE_URL` and `CREDENTIAL_ENCRYPTION_KEY` are set separately per Vercel target, and `CRON_SECRET` is set for Production. Every migration must be applied to both databases before deploying code that depends on it.

### 2.4 AI Provider Layer
The workflow runner depends on a shared `AIProvider` interface. The built-in `GeminiAIProvider` uses Google's `@google/genai` SDK and the environment-managed `GEMINI_API_KEY`; user-managed Gemini and OpenAI adapters use their vendor SDKs only on the server. Model IDs are curated and validated by provider; the stable Gemini default is `gemini-3.8-flash` and the OpenAI default is `gpt-6-luna`.

AI Text Generation (the persisted `gemini_ai` category), Classification, Extraction, Summarization, and Generation nodes pass bounded prompts to the selected provider. Structured results are parsed and validated locally; OpenAI strict JSON Schema additionally requires a closed object and every property in `required`. Execution logs contain only model, usage, output-type, and output-size metadata; prompts, completions, provider error bodies, and keys are not logged or returned.

The credential API accepts only Gemini/OpenAI keys, encrypts them with an environment-managed 32-byte key, and resolves them only after a session-owner/credential-owner match. Arbitrary custom provider URLs are disabled: adding credentialed endpoints requires a dedicated egress and SSRF review. Provider quotas and production abuse controls remain Phase 9 work. See [`phase-5-references.md`](phase-5-references.md), [`phase-6-references.md`](phase-6-references.md), and [`workflow-engine.md`](workflow-engine.md).

### 2.5 Native OAuth account foundation

`GET /api/integrations` returns safe setup readiness and connected-account metadata. `POST /api/integrations/:provider/connect` creates a short-lived transaction; `/api/integrations/oauth/:provider/callback` handles the provider response; and `DELETE /api/integrations/:provider/:integrationId` disconnects one owner-scoped account. Provider IDs, endpoints, scopes, and callback paths are fixed in `src/server/integrations/oauth-providers.ts`. Connect stays disabled unless that provider's server environment values and `OAUTH_REDIRECT_BASE_URL` are valid.

The existing session cookie remains host-only, `HttpOnly`, `SameSite=Strict`. Connect creates an independent `HttpOnly; SameSite=Lax` browser-binding cookie scoped only to that provider callback, because providers return via top-level GET navigation. The DB stores only digests of state and browser binding, the initiating session token hash, a context-bound encrypted PKCE verifier, exact redirect URI, and expiry. Callback consumes state once, verifies the binding and that the initiating server-side session remains active, then exchanges the code against the provider's fixed token endpoint. Gmail and Airtable use S256 PKCE; Slack uses the confidential-client flow by default because enabling Slack PKCE changes the app's public-client configuration.

Access and refresh tokens stay in AES-256-GCM ciphertext in `credentials.encrypted_payload`, with AAD bound to owner, integration, credential row, and provider. OAuth APIs never return ciphertext. The account layer supports token refresh and local disconnect; provider revocation is best-effort for Google/Slack, and Airtable instructs the user to revoke the app authorization in Airtable settings. The OAuth foundation does **not** yet provide Gmail, Slack, or Airtable workflow nodes/actions, resource discovery, or field mapping. See [`oauth-provider-setup.md`](oauth-provider-setup.md) and [`roadmap.md`](roadmap.md) for exact configuration and current readiness.
