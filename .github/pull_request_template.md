## Summary

<!-- What changed and why. Link the roadmap phase or issue. -->

## Roadmap phase

<!-- e.g. Phase 8 — Execution timeout protection -->

## Verification (required by AGENTS.md)

- [ ] `npm run lint` passes
- [ ] `npm test` passes (new behavior has tests)
- [ ] `npm run build` passes
- [ ] `npx drizzle-kit check` passes; schema changes include a generated migration
- [ ] Docs under `/docs/` and `README.md` updated if behavior or architecture changed

## Security checklist

- [ ] No secrets, tokens, or `.env` files committed
- [ ] New API payloads validated with Zod on the server
- [ ] Ownership derived from the verified session, never from client input
- [ ] Logs and errors do not contain keys, tokens, prompts, or raw request bodies
