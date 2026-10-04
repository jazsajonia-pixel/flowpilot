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
│   ├── AI Router & Provider API
│   ├── Integrations Gateway
│   └── Credentials Vault API
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
│   ├── User Bring-Your-Own Gemini Provider
│   ├── User Bring-Your-Own OpenAI Provider
│   └── Custom Compatible AI Provider Adapters
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
- **Visual Graph Editor:** `reactflow` (React Flow) for interactive node connection, drag-and-drop workflow construction, and real-time step inspection.

### 2.2 API & Serverless Backend
- **Platform:** Netlify Functions (Node.js REST API serverless endpoints).
- **Validation:** Server-side request parsing and validation using Zod.
- **Security:** Phase 2C establishes server-side email/password authentication and revocable cookie sessions. Protected-resource authorization and workflow ownership checks remain Phase 2D work; credential encryption remains a later phase.

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
- **Schema & Migrations:** Managed with Drizzle ORM and `drizzle-kit`, configured with migration outputs under `netlify/database/migrations/`. Phase 2B defines the core application entities; Phase 2C adds password-hash and session storage. Protected-resource authorization remains Phase 2D work. See [`database-schema.md`](database-schema.md) and [`authentication.md`](authentication.md) for table relationships and security boundaries.
- **Production Verification:** Remote production database query execution requires an active linked Netlify Database environment.

### 2.4 AI Provider Layer
The AI subsystem uses a provider abstraction layer to decoupling engine execution from specific AI vendors:

```
                  ┌──────────────────────┐
                  │    Workflow Node     │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ AI Provider Interface│
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  FlowPilot   │      │ User Gemini  │      │ User OpenAI  │
│ Gemini (Default)    │  Credential  │      │  Credential  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Gemini API   │      │ Gemini API   │      │ OpenAI API   │
└──────────────┘      └──────────────┘      └──────────────┘
```

- **FlowPilot Gemini:** Built-in default AI engine using platform API keys.
- **BYO Providers:** User-provided API-key registration is planned for Phase 6, together with the encrypted credential vault.
- **Security:** Credential encryption, key management, and server-only key use are planned for Phase 6 and are not implemented yet; do not store real third-party API keys in the current prototype.
