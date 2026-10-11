# FlowPilot database schema

This document describes the current Drizzle schema in `src/db/schema.ts` and migrations under `netlify/database/migrations/`. The migration directory name is historical; Vercel + Neon PostgreSQL is the current runtime.

## Tables and ownership

| Table | Purpose | Important relationships / fields |
|---|---|---|
| `users` | Application identities | Unique normalized email; account timestamps and password hash. |
| `sessions` | Revocable cookie sessions | Owner, SHA-256 session-token digest, expiry, and revoke timestamp. |
| `workflows` | Owner's workflow definitions | Owner reference; title, description, active flag. |
| `nodes` | Workflow graph steps | Workflow reference, category/type, JSONB position and bounded config. |
| `connections` | Directed graph edges | Composite workflow/node references prevent cross-workflow edges. |
| `executions` | Workflow run records | Owner/workflow association and pending/running/completed/failed state; optional scheduled slot. |
| `execution_logs` | Per-node run history | Execution reference and bounded JSONB summaries; historical node IDs survive graph edits. |
| `integrations` | Owner-scoped connected account metadata | Provider, display name, lifecycle status, and strictly non-secret JSONB settings. |
| `oauth_states` | One-time OAuth authorization transactions | Owner, provider, state/browser/session digests, encrypted PKCE verifier, exact redirect URI, expiry. Added by migration `0005_oauth_state`. |
| `credentials` | Encrypted AI/API or OAuth credential payloads | Owner, provider, encrypted payload; optional owner-matched integration reference. Migration `0005` makes non-null `integration_id` unique. |
| `data_records` | Owner-private JSON records | Unique owner/collection/key tuple and bounded JSONB data. |

All primary keys are PostgreSQL UUIDs. Timestamps use `timestamptz`. JSONB is for naturally structured, non-secret data. It is not an authorization boundary; API handlers enforce owner checks independently.

## OAuth account persistence

A successful authorization stores one account in `integrations` and one linked credential row. `integrations.settings` contains only the provider account ID, granted scopes, token expiry timestamps, and token type. The access/refresh-token set stays inside AES-256-GCM ciphertext in `credentials.encrypted_payload`; its authenticated context is bound to the owner, integration ID, credential ID, and provider. OAuth credentials are explicitly excluded from AI credential lists, AI quota counts, AI deletion, and AI provider resolution.

`oauth_states` is short-lived (ten minutes). It stores no raw OAuth `state` or browser-binding token: only their SHA-256 digests. It also stores the initiating session token hash, fixed provider ID, the exact redirect URI, and an encrypted PKCE verifier. A successful or denied callback consumes the transaction in one conditional `DELETE ... RETURNING` statement. A callback must match the provider, unexpired state, browser cookie and still-active original session before exchanging its authorization code.

Deleting a user cascades to sessions, integrations and credentials. Deleting an integration cascades to its linked credential. Revoking an OAuth account deletes local token ciphertext even when the provider has no revocation endpoint or cannot confirm revocation; see [`oauth-provider-setup.md`](oauth-provider-setup.md) for that boundary.

## Encryption and operational boundary

- The server-only `CREDENTIAL_ENCRYPTION_KEY` must be a stable Base64 encoding of exactly 32 random bytes per environment. It protects user AI keys, OAuth state verifiers, and OAuth token bundles. If lost/replaced, existing ciphertext cannot be decrypted; key backup and rotation remain operational responsibilities.
- Never put token values, client secrets, or other credentials into `integrations.settings`, workflow graphs, browser responses, or logs.
- The OAuth foundation does not implement Gmail/Slack/Airtable workflow actions or field mapping. See [`roadmap.md`](roadmap.md) for the connector boundary.

## Migration generation and preflight

Generate/check schema changes locally:

```bash
npx drizzle-kit generate --name oauth_state
npx drizzle-kit check
```

Before applying migration `0005_oauth_state` to a populated Neon database, check that converting the existing nullable `credentials.integration_id` index to a unique index will not fail:

```sql
SELECT integration_id, COUNT(*)
FROM credentials
WHERE integration_id IS NOT NULL
GROUP BY integration_id
HAVING COUNT(*) > 1;
```

The query must return no rows. The migration creates `oauth_states`, adds its owner/indexes, and replaces the non-unique credential integration index with a unique one; it does not delete credential rows. Apply and verify the migration on both `flowpilot-staging` (Vercel Preview) and `flowpilot-production` before adding provider OAuth environment variables or enabling Connect. Do not test with writes against the production database.
