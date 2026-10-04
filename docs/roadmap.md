# FlowPilot AI — Development Roadmap

This document outlines the sequential phases for building FlowPilot AI.

---

## Roadmap Phases

### Phase 0: Project Constitution & Architecture (COMPLETE)
- Establish project rules, `AGENTS.md`, and core repository documentation.
- Setup base Vite/React/TypeScript scaffolding, `.gitignore`, and `.env.example`.
- Define type abstractions for AI providers and visual workflow nodes.
- Define architecture for frontend, serverless backend, AI abstraction layer, and database.

### Phase 1: Application Foundation (COMPLETE)
- Set up Tailwind CSS, shadcn/ui base component system, and layout scaffolding.
- Implement core layout navigation (Sidebar, Header, Dashboard frame).
- Implement global state, React Router navigation, and TanStack Query API client foundation.

### Phase 2A: Database Infrastructure + Drizzle + Netlify Database (COMPLETE)
- Set up `@netlify/database` and `drizzle-orm` server-side database integration.
- Establish `src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.ts`, and `netlify/database/migrations/`.
- Implement `netlify/functions/db-health.ts` server-side database connectivity health check.

### Phase 2B: Application Database Schema (COMPLETE)
- Define Drizzle schema for `users`, `workflows`, `nodes`, `connections`, `executions`, `execution_logs`, `credentials`, and `integrations`.
- Generate and verify initial Drizzle migrations under `netlify/database/migrations/`.

### Phase 2C: Authentication & Sessions (COMPLETE)
- Implement email/password registration and login in Netlify Functions.
- Create revocable, expiring server-side sessions with hashed opaque cookie tokens.
- Add current-session and logout endpoints; do not add protected-resource authorization in this phase.

### Phase 2D: Protected API & Ownership Verification (COMPLETE)
- Add authenticated workflow metadata list/create/read/update/delete endpoints.
- Derive ownership from the verified session and scope every item query/mutation by both workflow ID and owner ID.
- Validate all mutation payloads and reject client-supplied identity/ownership fields.
- Preserve execution history when workflows are deleted; graph editing and execution remain later phases.

### Phase 3: Visual Workflow Builder
- Integrate React Flow for interactive canvas editing.
- Implement custom node component rendering (Triggers, AI, Logic, Actions).
- Implement node property sidebar inspector, drag-and-drop node adding, connection validation, and workflow state persistence.

### Phase 4: Workflow Execution Engine
- Implement topological graph execution engine in Netlify Functions.
- Build node execution handlers for Triggers, Logic (Condition, Filter), and Actions (HTTP Request, Webhook).
- Build variable interpolation system (`{{steps.nodeId.data}}`) and execution context manager.
- Implement execution log tracking and database persistence.

### Phase 5: Gemini AI Integration
- Implement default built-in Gemini AI Provider using `@google/genai` / REST API.
- Build AI Workflow Nodes (Gemini AI, Classification, Extraction, Summarization, Generation).
- Enable structured prompt processing and output parsing in execution engine.

### Phase 6: Bring Your Own AI (BYO AI)
- Build encrypted Credential Vault in Netlify Database for user API keys.
- Extend AI Provider Interface to support user-provided Gemini API keys, OpenAI API keys, and custom providers.
- Build UI for user AI provider management and model selection in nodes.

### Phase 7: Automation Integrations & Triggers
- Implement Webhook Trigger endpoint receiver with dynamic path routing.
- Implement Schedule / Cron Trigger system.
- Build Email notification action nodes and database CRUD action nodes.

### Phase 8: Execution Monitoring, Logs & Reliability
- Build real-time Execution History and Detailed Log Inspector in Frontend.
- Implement retry mechanics, failure handling, and execution timeout protection in engine.

### Phase 9: Security, Testing & Production Hardening
- Implement rate limiting, key encryption verification, and security audit.
- Write unit tests for workflow engine execution and Zod validation schemas.
- Set up automated CI/CD checks for GitHub Actions and Netlify deployment.

### Phase 10: Final UI/UX & Portfolio Polish
- Refine dashboard analytics, template gallery, and visual aesthetics.
- Final documentation polish, demo setup, and production deployment on Netlify.
