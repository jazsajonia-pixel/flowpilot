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
- **Security:** JWT authentication header verification, server-side workflow ownership verification, and encrypted key management.

### 2.3 AI Provider Layer
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
- **BYO Providers:** Users can register custom API keys for Google Gemini, OpenAI, or compatible custom endpoints.
- **Security:** Third-party AI keys are stored encrypted at rest in Netlify Database (PostgreSQL) and accessed exclusively in serverless Netlify Functions during node execution.

### 2.4 Workflow Execution Engine
- **Graph Evaluation:** Graph traversal engine that executes triggered flows sequentially or in parallel based on node dependencies.
- **Context Injection:** Outputs from preceding nodes are available to downstream nodes via double-curly expressions or step references (e.g., `{{steps.trigger.data.body}}`).
- **Resilience:** Built-in node retry mechanics, error capture, branch skipping on negative evaluation conditions, and structured execution logging.

### 2.5 Database Layer (Netlify Database, PostgreSQL & Drizzle ORM)
- **Database:** Netlify Database (PostgreSQL platform for FlowPilot).
- **ORM:** Drizzle ORM for schema management, migrations, and type-safe database queries.
- **Core Entities:** `User`, `Workflow`, `Node`, `Connection`, `Execution`, `ExecutionLog`, `Credential`, `Integration`.
