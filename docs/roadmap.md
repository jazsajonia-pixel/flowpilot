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
- Preserve execution history when workflows are deleted; graph editing follows in Phase 3 and execution remains later.

### Phase 3: Visual Workflow Builder (COMPLETE)
- Integrate React Flow (`@xyflow/react`) for interactive canvas editing and custom trigger, AI, logic, and action nodes.
- Add a node library with tap-to-add and drag-and-drop, plus a node inspector for label editing.
- Validate connections (no self-links, duplicate links, trigger targets, or cycles) and allow at most one trigger.
- Persist graph positions, nodes, and connections through an authenticated, owner-scoped API with atomic replacement.
- Keep activation, execution, and node-specific credentials/settings out of scope.

### Phase 4: Workflow Execution Engine (COMPLETE)
- Implement bounded topological graph execution for owned workflows in Netlify Functions; manual runs require one Manual Trigger.
- Support Condition true/false branches, Filter, HTTPS HTTP Request, and HTTPS Webhook Action nodes.
- Add prototype-safe variable interpolation from trigger input and prior step results.
- Persist execution status and privacy-minimized per-node logs; expose a manual Run dialog and status summary in the editor.
- Restrict outbound requests to public HTTPS on port 443 with all-address DNS checks, pinned address, no redirects, and request/response/time limits.
- Add unit tests for execution branches, filters, interpolation, unsupported nodes, and outbound destination validation.
- Keep runs synchronous and capped (50 graph nodes, 25 executed steps, eight-second graph budget). No live database integration or production deployment was performed.

### Phase 5: Gemini AI Integration (COMPLETE)
- Implement the default server-side Gemini provider with the official `@google/genai` SDK, `GEMINI_API_KEY`, and the stable `gemini-3.8-flash` default.
- Execute Gemini AI, Classification, Extraction, Summarization, and Generation nodes through the shared AI provider interface.
- Support bounded prompts, provider cancellation, JSON mode/JSON Schema, local structured-output validation, and privacy-minimized execution summaries.
- Provide node-specific configuration editors without exposing provider keys or arbitrary model selection in workflow data.
- Validate with deterministic fake-provider unit tests; no live API key, paid model request, database integration, or deployment is used.

### Phase 6: Bring Your Own AI (BYO AI) (COMPLETE)
- Encrypt user-managed Gemini and OpenAI API keys at rest in the existing credentials table; expose only masked metadata and credential IDs to the client.
- Resolve AI providers server-side after session-derived owner verification; support user-provided Gemini and OpenAI keys through the shared provider interface.
- Add credential management and curated provider-specific model selection to the UI and workflow nodes.
- Keep arbitrary custom endpoints disabled until credentialed outbound requests receive a separate SSRF, DNS-pinning, and credential-exfiltration review; custom provider adapters remain a code-level extension point.
- Validate with deterministic tests only; do not make live provider calls or deploy during implementation.

### Phase 7: Automation Integrations & Triggers (IN PROGRESS)
- Implement Webhook Trigger endpoint receiver with dynamic path routing. *(Initial bounded slice complete.)*
- Implement Schedule / Cron Trigger system. *(Hobby-compatible daily/weekly UTC slice complete; see `docs/schedule-trigger.md`.)*
- Build Email notification action nodes and database CRUD action nodes.

### Phase 8: Execution Monitoring, Logs & Reliability
- Build real-time Execution History and Detailed Log Inspector in Frontend.
- Implement retry mechanics, failure handling, and execution timeout protection in engine.

### Phase 9: Security, Testing & Production Hardening
- Audit and verify the Phase 6 key-encryption design; add rate limiting and production security review.
- Write unit tests for workflow engine execution and Zod validation schemas.
- Set up automated CI/CD checks for GitHub Actions and Vercel deployment.

### Phase 10: Final UI/UX & Portfolio Polish
- Refine dashboard analytics, template gallery, and visual aesthetics.
- Final documentation polish, demo setup, and production deployment on Vercel + Neon.
