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
- **Security:** Phase 2C establishes server-side email/password authentication and revocable cookie sessions. Phases 2D and 3 protect workflow metadata and graph endpoints with owner-scoped queries. Phase 4 requires the same owner check to create executions and limits outbound requests to public HTTPS. Phase 6 adds encrypted user credentials and session-owner checks before any server-side decryption. Public endpoint abuse controls and per-user provider quotas remain later work. Node 22 is pinned through `.nvmrc`.

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
- **Provider Secret Boundary:** `GEMINI_API_KEY` and `CREDENTIAL_ENCRYPTION_KEY` are server-only environment variables and are never exposed to Vite. User BYO keys are encrypted with AES-256-GCM in `credentials.encrypted_payload`; graph configuration stores only an owner-scoped credential ID, and management API responses never contain plaintext keys or ciphertext.
- **Schema & Migrations:** Managed with Drizzle ORM and `drizzle-kit`, configured with migration outputs under `netlify/database/migrations/`. Phase 2B defines core entities; Phase 2C adds password-hash/session storage; Phases 2D and 3 provide owner-scoped metadata/graph access; Phase 4 uses the existing execution and execution-log tables. See [`database-schema.md`](database-schema.md), [`authentication.md`](authentication.md), [`workflow-api.md`](workflow-api.md), [`workflow-builder.md`](workflow-builder.md), and [`workflow-engine.md`](workflow-engine.md) for data and security boundaries.
- **Production Verification:** Remote production database query execution requires an active linked Netlify Database environment.

### 2.4 AI Provider Layer
The workflow runner depends on a shared `AIProvider` interface. The built-in `GeminiAIProvider` uses Google's `@google/genai` SDK and the environment-managed `GEMINI_API_KEY`; user-managed Gemini and OpenAI adapters use their vendor SDKs only on the server. Model IDs are curated and validated by provider; the stable Gemini default is `gemini-3.8-flash` and the OpenAI default is `gpt-6-luna`.

AI Text Generation (the persisted `gemini_ai` category), Classification, Extraction, Summarization, and Generation nodes pass bounded prompts to the selected provider. Structured results are parsed and validated locally; OpenAI strict JSON Schema additionally requires a closed object and every property in `required`. Execution logs contain only model, usage, output-type, and output-size metadata; prompts, completions, provider error bodies, and keys are not logged or returned.

The credential API accepts only Gemini/OpenAI keys, encrypts them with an environment-managed 32-byte key, and resolves them only after a session-owner/credential-owner match. Arbitrary custom provider URLs are disabled: adding credentialed endpoints requires a dedicated egress and SSRF review. Provider quotas and production abuse controls remain Phase 9 work. See [`phase-5-references.md`](phase-5-references.md), [`phase-6-references.md`](phase-6-references.md), and [`workflow-engine.md`](workflow-engine.md).
