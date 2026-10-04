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
└── Database Layer (PostgreSQL / Prisma ORM)
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
- **Security:** Third-party AI keys are stored encrypted at rest in PostgreSQL and accessed exclusively in serverless Netlify Functions during node execution.

### 2.4 Workflow Execution Engine
- **Graph Evaluation:** Graph traversal engine that executes triggered flows sequentially or in parallel based on node dependencies.
- **Context Injection:** Outputs from preceding nodes are available to downstream nodes via double-curly expressions or step references (e.g., `{{steps.trigger.data.body}}`).
- **Resilience:** Built-in node retry mechanics, error capture, branch skipping on negative evaluation conditions, and structured execution logging.

### 2.5 Database Layer (PostgreSQL & Prisma)
- **Database:** PostgreSQL hosted on Neon / Supabase.
- **ORM:** Prisma ORM for schema management, migrations, and type-safe database queries.
- **Core Entities:** `User`, `Workflow`, `Node`, `Connection`, `Execution`, `ExecutionLog`, `Credential`, `Integration`.

---

## 3. Data Flow

### 3.1 Workflow Creation Flow
1. User builds workflow graph in visual builder (React Flow UI).
2. UI submits updated graph JSON payload to `/api/workflows`.
3. Server validates JSON schema with Zod and verifies user identity.
4. Prisma writes updated workflow structure, nodes, and edges to PostgreSQL.

### 3.2 Workflow Execution Flow
1. An incoming event occurs (e.g., Webhook HTTP request, manual UI click, scheduled cron timer).
2. Execution engine initializes a `WorkflowExecution` record with state `running`.
3. Engine runs starting trigger node, capturing input payload into the execution context.
4. Engine processes graph nodes in topological order:
   - If AI node: Engine queries AI Provider Interface with selected credential adapter.
   - If Logic node: Engine evaluates conditions and decides which output handle branch to follow.
   - If Action node: Engine performs HTTP request, sends email, or updates database.
5. Node output data is recorded into `ExecutionLog` entries.
6. Engine updates `WorkflowExecution` state to `completed` or `failed`.
