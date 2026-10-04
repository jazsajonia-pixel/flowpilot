# FlowPilot AI

> An AI-Powered Visual Workflow Automation Platform

FlowPilot AI is a modern, web-based visual automation platform that enables users to connect triggers, AI intelligence models, logic conditions, database operations, and external services into powerful automated workflows.

---

## 📌 Current Development Status

- **Phase 0 — Project Constitution & Architecture:** COMPLETE
- **Phase 1 — Application Foundation:** COMPLETE
- **Phase 2A — Database Infrastructure + Drizzle + Netlify Database:** COMPLETE
- **Phase 2B — Application Database Schema:** NEXT

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
- **Visual Builder:** React Flow (`reactflow`) *(Planned for Phase 3)*
- **Icons:** Lucide React (`lucide-react`)
- **Routing:** React Router (`react-router-dom`)
- **Data Fetching:** TanStack Query (`@tanstack/react-query`)
- **Forms & Validation:** React Hook Form & Zod

### Backend & API
- **Runtime:** Node.js with TypeScript
- **API Architecture:** RESTful Endpoints
- **Serverless Hosting:** Netlify Functions

### Database Layer
- **Database:** Netlify Database (PostgreSQL)
- **ORM & Migrations:** Drizzle ORM & drizzle-kit
- **Serverless Access:** `@netlify/database` integration via Netlify Functions

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
├── API & Serverless Backend (Netlify Functions)
│   ├── Authentication & Authorization
│   ├── Workflows API
│   ├── Executions API
│   ├── AI Router
│   ├── Credentials Vault
│   └── Database Health Check (/.netlify/functions/db-health)
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
└── Database (Netlify Database / PostgreSQL / Drizzle ORM)
    ├── Users & Auth
    ├── Workflows & Nodes
    ├── Executions & Step Logs
    └── Credentials (Encrypted)
```

---

## 🔒 Security Rules

- **Zero Secrets in Client:** API keys and database credentials are never exposed to frontend code or client bundles.
- **Git Hygiene:** Secrets and `.env` files are strictly excluded from source control. Template configuration is provided in `.env.example`.
- **Server-Side Credential & Database Handling:** Database queries and third-party user API keys are handled strictly server-side in Netlify Functions and encrypted at rest in Netlify Database.
- **Strict Payload Validation:** All API requests are validated with **Zod** schemas.
- **Server-Side Authorization:** Workflow ownership and authorization are enforced strictly server-side.
- **Credential Masking:** Sensitive tokens are masked in UI and logs (`sk-••••••••1234`).

---

## 🗺️ Roadmap Summary

1. **Phase 0:** Project Constitution & Architecture *(Completed)*
2. **Phase 1:** Application Foundation *(Completed)*
3. **Phase 2A:** Database Infrastructure + Drizzle + Netlify Database *(Completed)*
4. **Phase 2B:** Application Database Schema *(Next)*
5. **Phase 2C:** Authentication & Sessions
6. **Phase 2D:** Protected API & Ownership Verification
7. **Phase 3:** Visual Workflow Builder (React Flow)
8. **Phase 4:** Workflow Execution Engine
9. **Phase 5:** Gemini AI Integration
10. **Phase 6:** Bring Your Own AI (BYO AI)
11. **Phase 7:** Automation Integrations & Webhooks
12. **Phase 8:** Execution Monitoring & Reliability
13. **Phase 9:** Security, Testing & Production Hardening
14. **Phase 10:** Final UI/UX & Portfolio Polish

See [`docs/roadmap.md`](docs/roadmap.md) for full details.

---

## 📄 Documentation

- [`AGENTS.md`](AGENTS.md) — AI Coding Rules, Development Principles, and Security Mandates.
- [`docs/architecture.md`](docs/architecture.md) — Detailed Architecture and Data Flow Specs.
- [`docs/workflow-engine.md`](docs/workflow-engine.md) — Node Types, Graph Execution, and Logging Specs.
- [`docs/roadmap.md`](docs/roadmap.md) — Multi-Phase Development Roadmap.

---

## 🚀 Development Setup

```bash
# Install dependencies
npm install

# Run type checks
npm run lint

# Run Vite dev server
npm run dev

# Build for production
npm run build
```
