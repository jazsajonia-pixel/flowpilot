# FlowPilot AI

> An AI-Powered Visual Workflow Automation Platform

FlowPilot AI is a modern, web-based visual automation platform that enables users to connect triggers, AI intelligence models, logic conditions, database operations, and external services into powerful automated workflows.

---

## 📌 Current Development Status

- **Phase 0 — Project Constitution & Architecture:** COMPLETE
- **Phase 1 — Application Foundation:** COMPLETE
- **Phase 2A — Database Infrastructure + Drizzle + Netlify Database:** COMPLETE
- **Phase 2B — Application Database Schema:** COMPLETE
- **Phase 2C — Authentication & Sessions:** COMPLETE
- **Phase 2D — Protected API & Ownership Verification:** COMPLETE
- **Phase 3 — Visual Workflow Builder:** COMPLETE
- **Phase 4 — Workflow Execution Engine:** COMPLETE
- **Phase 5 — Gemini AI Integration:** COMPLETE
- **Phase 6 — Bring Your Own AI:** COMPLETE
- **Phase 7 — Automation Integrations & Triggers:** COMPLETE (Webhook and Schedule triggers, Send Email, owner-private database record actions)

---

## 🎯 Vision & Concept

FlowPilot AI feels like a modern visual automation platform (similar to n8n or Zapier) designed ground-up with AI intelligence natively built into every workflow step.

### Example Workflow Concept:
```
Incoming Webhook
      ↓
Gemini AI Processing
      ↓
Classify Information & Extract Priority
      ↓
Condition (IF Priority == "High")
      ├─► True:  Send Urgent Notification Email + Insert into PostgreSQL
      └─► False: Log Event + Call Third-Party API
```

---

## 🛠️ Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS & shadcn/ui component architecture
- **Visual Builder:** React Flow (`@xyflow/react`) with custom trigger, AI, logic, and action nodes
- **Icons:** Lucide React (`lucide-react`)
- **Routing:** React Router (`react-router-dom`)
- **Data Fetching:** TanStack Query (`@tanstack/react-query`)
- **Forms & Validation:** React Hook Form & Zod

### Backend & API
- **Runtime:** Node.js with TypeScript
- **API Architecture:** RESTful Endpoints
- **Hosting:** Vercel (static Vite build + one bundled Node serverless API function, `api/dispatch.ts` (all `/api/*` paths are rewritten to it in `vercel.json`))
- **Scheduling:** One once-daily Vercel Cron job (Hobby plan: starts 00:00–00:59 UTC) — see [`docs/schedule-trigger.md`](docs/schedule-trigger.md)

### Database Layer
- **Database:** Neon PostgreSQL (separate production and staging/Preview projects)
- **ORM & Migrations:** Drizzle ORM & drizzle-kit
- **Serverless Access:** `drizzle-orm/neon-http` with `@neondatabase/serverless` (no interactive transactions; use `db.batch` or single statements)

### AI Layer
- **Default Built-in Provider:** Google Gemini API
- **Bring Your Own AI (BYO AI):** Abstraction layer supporting user-provided keys for Google Gemini, OpenAI, and custom compatible endpoints.

---

## 🏗️ High-Level System Architecture

```
FlowPilot AI
│
├── Frontend (React / Vite)
│   ├── Dashboard
│   ├── Workflow Builder (React Flow)
│   ├── Workflow Templates
│   ├── Execution History & Logs
│   ├── AI Providers Config
│   ├── Integrations
│   └── Settings
│
├── API & Serverless Backend (Vercel Function + bundled dispatcher)
│   ├── Authentication & Authorization
│   ├── Workflows API
│   ├── Executions API
│   ├── AI Router
│   ├── Credentials Vault
│   └── Database Health Check (/api/db-health)
│
├── Workflow Engine
│   ├── Trigger System (Manual, Webhook, Schedule)
│   ├── Node Graph Evaluator
│   ├── Logic & Conditions Engine
│   ├── Context Data Interpolation
│   └── Execution Logging
│
├── AI Provider Layer
│   ├── FlowPilot Gemini (Built-in)
│   ├── User Gemini (BYO)
│   ├── User OpenAI (BYO)
│   └── Custom Provider Adapters
│
└── Database (Neon PostgreSQL / Drizzle ORM)
    ├── Users & Auth
    ├── Workflows & Nodes
    ├── Executions & Step Logs
    ├── Credentials (AES-256-GCM encrypted; owner-scoped)
```

---

## 🔒 Security Rules

- **Zero Secrets in Client:** API keys and database credentials are never exposed to frontend code or client bundles.
- **Git Hygiene:** Secrets and `.env` files are strictly excluded from source control. Template configuration is provided in `.env.example`.
- **Server-Side Credential & Database Handling:** Database queries, key decryption, and provider calls run in server code. `GEMINI_API_KEY` and `CREDENTIAL_ENCRYPTION_KEY` are server-only; BYO Gemini/OpenAI key APIs return only masked metadata and user-owned credential IDs.
- **Strict Payload Validation:** All API requests are validated with **Zod** schemas.
- **Server-Side Authentication & Authorization:** Workflow metadata and graph endpoints require server-verified sessions and owner-scoped queries. Other placeholder frontend pages are not protected, and client-side session display is not access control.
- **Execution Safety:** Manual execution rechecks workflow ownership, validates graph settings, limits runtime/steps/request sizes, and blocks non-public outbound destinations. Logs omit submitted values and HTTP bodies. Rate limiting, abuse monitoring, and deployment egress controls are still required before production execution.
- **AI Log Privacy:** Workflow logs omit AI prompts, completions, and provider error bodies; only safe model/usage/output-size metadata is retained.

---

## 🗺️ Roadmap Summary

1. **Phase 0:** Project Constitution & Architecture *(Completed)*
2. **Phase 1:** Application Foundation *(Completed)*
3. **Phase 2A:** Database Infrastructure + Drizzle + Netlify Database *(Completed)*
4. **Phase 2B:** Application Database Schema *(Completed)*
5. **Phase 2C:** Authentication & Sessions *(Completed)*
6. **Phase 2D:** Protected API & Ownership Verification *(Completed)*
7. **Phase 3:** Visual Workflow Builder (React Flow) *(Completed)*
8. **Phase 4:** Workflow Execution Engine *(Completed)*
9. **Phase 5:** Gemini AI Integration *(Completed)*
10. **Phase 6:** Bring Your Own AI (BYO AI) *(Completed)*
11. **Phase 7:** Automation Integrations & Webhooks *(In progress)*
12. **Phase 8:** Execution Monitoring & Reliability
13. **Phase 9:** Security, Testing & Production Hardening
14. **Phase 10:** Final UI/UX & Portfolio Polish

See [`docs/roadmap.md`](docs/roadmap.md) for full details.

---

## 📄 Documentation

- [`AGENTS.md`](AGENTS.md) — AI Coding Rules, Development Principles, and Security Mandates.
- [`docs/architecture.md`](docs/architecture.md) — Detailed Architecture and Data Flow Specs.
- [`docs/database-schema.md`](docs/database-schema.md) — Phase 2B database tables, relationships, and security boundaries.
- [`docs/authentication.md`](docs/authentication.md) — Phase 2C account authentication, cookie sessions, and security boundaries.
- [`docs/workflow-api.md`](docs/workflow-api.md) — Phase 2D protected workflow metadata routes and ownership rules.
- [`docs/workflow-builder.md`](docs/workflow-builder.md) — Phase 3 editor interactions, graph validation, and persistence contract.
- [`docs/workflow-engine.md`](docs/workflow-engine.md) — Node Types, Graph Execution, and Logging Specs.
- [`docs/phase-6-references.md`](docs/phase-6-references.md) — Official provider, SDK, and runtime references for BYO AI.
- [`docs/phase-4-references.md`](docs/phase-4-references.md) — Official sources used for execution limits and outbound request safeguards.
- [`docs/roadmap.md`](docs/roadmap.md) — Multi-Phase Development Roadmap.

---

## 🚀 Development Setup

```bash
# Install dependencies
npm install

# Run type checks
npm run lint

# Run authentication security unit tests
npm test

# Run Vite dev server
npm run dev

# API routes (including /api/auth/*) are served by the Vercel function in api/dispatch.ts,
# which loads server-build/dispatcher.mjs produced by `npm run build`.
# Run them locally with `vercel dev` when the Vercel CLI is available/configured.

# Build for production
npm run build
```
