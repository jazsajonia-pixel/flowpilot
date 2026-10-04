# AGENTS.md — FlowPilot AI Development Constitution

This document contains instructions and guidelines for AI coding agents (such as Jules) working on the FlowPilot AI codebase.

---

## 1. Project Identity

**FlowPilot AI** is an AI-powered workflow automation SaaS application.

Users visually create automated workflows that connect triggers, AI processing, conditions, APIs, databases, notifications, and other actions. The application provides a modern, intuitive visual workflow editor built on top of React Flow, backed by a Node.js API, Netlify Database (PostgreSQL with Drizzle ORM), and Netlify Functions.

---

## 2. Development Principles

When contributing to FlowPilot AI, always adhere to these principles:

- **TypeScript-first & Strong Typing:** All code must be strictly typed using TypeScript. Avoid `any` types; define explicit interfaces and types.
- **Modular Architecture:** Structure components, services, and modules into small, single-responsibility files.
- **Reusable Components:** Build UI elements using standard React patterns and shadcn/ui/Tailwind design patterns.
- **Separation of Concerns:** Strictly separate frontend UI concerns from backend execution logic, database access, and secret handling.
- **Avoid Unnecessary Dependencies:** Rely on the established technology stack before introducing external libraries.
- **Avoid Duplicated Logic:** Reuse existing helpers, hooks, and utilities instead of recreating similar logic.
- **Preserve Existing Functionality:** Always ensure existing features and tests remain fully functional when adding new code.
- **Targeted Edits:** Do not rewrite or reformat unrelated files.
- **Approved Stack Alignment:** Do not introduce technologies outside the approved architecture without explicit architectural justification and user approval.

---

## 3. AI Coding Rules

Before modifying any code in this repository, AI agents must execute the following workflow:

1. **Inspect existing code:** Read and understand the existing implementation and surrounding context before editing.
2. **Understand architecture:** Ensure planned modifications align with the system architecture documented in `/docs/architecture.md`.
3. **Make atomic changes:** Make the smallest appropriate change required to fulfill the task.
4. **Preserve existing functionality:** Maintain backward compatibility and avoid breaking adjacent functionality.
5. **Type Check:** Run TypeScript type checks (`npm run lint` or `npx tsc --noEmit`) to ensure zero type errors.
6. **Run Tests:** Run all available unit and integration tests after making changes.
7. **Production Build Check:** Execute `npm run build` after significant changes to verify bundler compatibility.
8. **Fix Errors Immediately:** Resolve any compilation, linting, or runtime errors introduced by your implementation before completing the step.
9. **Maintain Documentation:** Update relevant documentation under `/docs/` whenever architectural changes occur.

---

## 4. Security Rules

Security is paramount in FlowPilot AI. Every contribution must follow these security mandates:

- **No Secrets in Frontend:** Never expose secret API keys, master credentials, or service keys in client-side code.
- **No Secrets in Source Control:** Never commit API keys, tokens, database URLs, or real credentials into Git.
- **Ignore Local Environments:** `.env` and `.env.local` must remain in `.gitignore`. Always maintain `.env.example` with template values only.
- **Server-side Credential Handling:** User-provided third-party API credentials (e.g., Gemini, OpenAI keys) must be processed and executed strictly on the server side (Netlify Functions / API layer).
- **Encryption at Rest:** User API credentials stored in Netlify Database must be encrypted at rest.
- **API Request Validation:** All incoming API payloads must be validated on the server side using **Zod** schemas.
- **Server-side Auth & Authorization:** Enforce authentication and authorization server-side on every protected API endpoint. Never rely on client-side state for access control.
- **No Client Credential Exposure:** Never expose database connection strings or administrative credentials to client apps.
- **Zero-Trust Client Data:** Never trust client-provided user IDs or ownership flags. Always verify workflow and resource ownership on the server using verified JWT/session user identities.
- **Credential Masking:** Always mask sensitive API credentials in UI views and logs (e.g., `sk-••••••••1234`). Never log full API keys or bearer tokens.

---

## 5. Git Rules

- **Descriptive Commits:** Use clear, descriptive commit messages following standard conventions (e.g., `feat:`, `fix:`, `docs:`, `chore:`).
- **Focused Commits:** Keep commits scoped to a single logical feature or issue.
- **Clean Tree:** Never commit `.env`, build artifacts (`/dist`), or temporary files.
- **Preserve Functionality:** Do not remove working features or tests simply to simplify implementation.

---

## 6. Mobile Development Considerations

The primary project maintainer develops and manages this project from a mobile device.

To ensure seamless management and deployment:

- **Clear Documentation:** Maintain exhaustive, clear, and unambiguous project documentation.
- **Reproducible Commands:** Provide exact, copy-pasteable CLI commands for builds, linting, and testing.
- **Automated Verification:** The AI agent must run all linting, type-checking, and build verifications autonomously within its environment.
- **Cloud Deployable Architecture:** Keep the application deployable cleanly via standard **GitHub → Netlify** CI/CD pipelines.
- **Zero Local Desktop Assumption:** Never assume the maintainer has a local desktop environment to run debuggers or manual local setups. Make all deployment and verification steps completely transparent and autonomous.
