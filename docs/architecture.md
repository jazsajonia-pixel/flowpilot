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
│   ├── Integrations Hub
│   └── User Settings
│
├── API Layer (REST / Netlify Functions)
│   ├── Authentication & Authorization
│   ├── Workflows Management API
│   ├── Execution Logs API
│   ├── Internal AI Provider Interface (server-side)
│   ├── Integrations Gateway
│   └── Credentials Vault API (planned Phase 6)
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
│   ├── BYO Gemini/OpenAI providers (planned Phase 6)
│   └── Custom compatible providers (future)
│
└── Database Layer (Netlify Database / PostgreSQL / Drizzle ORM)
    ├── Users & Auth
    ├── Workflows & Templates
    ├── Nodes & Connections
    ├── Executions & Step Logs
    ├── Credentials (Encrypted)
    └── Integrations & Webhooks
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
- **Platform:** Netlify Functions (Node.js REST API serverless endpoints).
- **Validation:** Server-side request parsing and validation using Zod.
- **Security:** Phase 2C establishes server-side email/password authentication and revocable cookie sessions. Phases 2D and 3 protect workflow metadata and graph endpoints with owner-scoped queries. Phase 4 requires the same owner check to create executions and limits outbound requests to public HTTPS. Phase 5 uses a server-only Gemini provider with an environment-managed key; public endpoint abuse controls, per-user credentials, and credential encryption remain future work. Node 22 is pinned through `.nvmrc`.

### 2.3 Database Layer (Server-Side Serverless Access)
```
React Frontend
      │ (HTTPS REST API / JSON)
      ▼
Netlify Functions
      │
      ▼
Drizzle ORM (drizzle-orm/netlify-db)
      │
      ▼
Netlify Database (PostgreSQL)
```
- **Native Adapter:** Server-side database operations use Netlify's native Drizzle adapter (`drizzle-orm/netlify-db` via `@netlify/db`).
- **Strict Boundary:** Database access logic (`src/db/`) is restricted exclusively to server-side Netlify Functions.
- **Zero Client Exposure:** Database credentials and connection strings are never exposed to Vite client bundles or React UI code.
- **Provider Secret Boundary:** `GEMINI_API_KEY` is read only by server-side AI provider code and is not accepted in graph configuration or exposed to the Vite client. BYO keys and encrypted credential storage are not implemented.
- **Schema & Migrations:** Managed with Drizzle ORM and `drizzle-kit`, configured with migration outputs under `netlify/database/migrations/`. Phase 2B defines core entities; Phase 2C adds password-hash/session storage; Phases 2D and 3 provide owner-scoped metadata/graph access; Phase 4 uses the existing execution and execution-log tables. See [`database-schema.md`](database-schema.md), [`authentication.md`](authentication.md), [`workflow-api.md`](workflow-api.md), [`workflow-builder.md`](workflow-builder.md), and [`workflow-engine.md`](workflow-engine.md) for data and security boundaries.
- **Production Verification:** Remote production database query execution requires an active linked Netlify Database environment.

### 2.4 AI Provider Layer
The Phase 5 workflow runner depends on the shared `AIProvider` interface rather than calling Google from the editor. The built-in `GeminiAIProvider` uses Google's `@google/genai` SDK from `src/server/ai/`, with `GEMINI_API_KEY` read only in the Netlify Function runtime and `GEMINI_MODEL_ID` as an optional server-side override. The stable default is `gemini-3.8-flash`.

Gemini AI, Classification, Extraction, Summarization, and Generation nodes pass bounded prompts to that provider. Structured results use JSON mode and a bounded JSON Schema, then are parsed and validated locally before being made available to downstream nodes. Execution logs contain only model, usage, output-type, and output-size metadata; prompts, completions, provider error bodies, and keys are not logged or returned.

BYO Gemini/OpenAI credentials, encrypted credential storage, per-user model selection, quotas, and production abuse controls remain Phase 6/9 work. Do not store provider keys in workflow configuration or expose them to client code. See [`phase-5-references.md`](phase-5-references.md) for current vendor/runtime references and [`workflow-engine.md`](workflow-engine.md) for execution limits.
