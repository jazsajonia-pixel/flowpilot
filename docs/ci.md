# Continuous Integration & Development Automation

FlowPilot AI verifies every change automatically in GitHub Actions, so the maintainer can review and merge from a mobile device without running anything locally.

## What runs

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

Triggers: every pull request to `main`, every push to `main`, and manual runs (Actions tab → CI → Run workflow).

| Step | Command | Fails when |
| --- | --- | --- |
| Type check | `npm run lint` | Any TypeScript error |
| Unit tests | `npm test` | Any test fails |
| Production build | `npm run build` | Vite or the serverless dispatcher bundle fails |
| Migration snapshot check | `npx drizzle-kit check` | Migration snapshots are inconsistent |
| Schema drift | `npx drizzle-kit generate` + `git status` | `src/db/schema.ts` changed without a committed migration |
| Repository hygiene | `git diff --check`, tracked-file checks | Whitespace errors, a tracked `.env*` file (other than `.env.example`), or tracked build output |

CI uses the Node.js version in `.nvmrc` and needs no secrets: tests use injected fakes and never call live databases, AI providers, or email services.

## Dependency updates

[`.github/dependabot.yml`](../.github/dependabot.yml) opens grouped weekly npm update PRs (Mondays, Asia/Manila) and monthly GitHub Actions updates. Every Dependabot PR runs the full CI pipeline before it can be merged.

## Pull requests and tasks

- [`.github/pull_request_template.md`](../.github/pull_request_template.md) carries the AGENTS.md verification and security checklist into every PR.
- [`.github/ISSUE_TEMPLATE/feature-task.md`](../.github/ISSUE_TEMPLATE/feature-task.md) defines a scoped roadmap task with acceptance criteria that a human or AI coding agent can pick up.

## Recommended repository settings

To make CI a hard merge gate, enable branch protection on `main` (Settings → Branches → Add rule):

- Require a pull request before merging
- Require status checks to pass: **CI / Lint, test, build**
- Require branches to be up to date before merging

## Reproduce CI locally

```bash
npm ci && npm run lint && npm test && npm run build && npx drizzle-kit check
```
