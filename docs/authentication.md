# Phase 2C — Authentication & Sessions

## Design decision

FlowPilot uses email/password sign-in with **opaque, database-backed sessions**, not JWTs. A server-side session record makes logout and revocation effective immediately and avoids putting user claims in a long-lived self-contained token. The browser receives a random 32-byte bearer token; the database stores only its SHA-256 digest.

## Authentication endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Validate the request, hash the password, create an account, and start a session. |
| `POST` | `/api/auth/login` | Verify the password and rotate the current browser session. |
| `GET` | `/api/auth/session` | Return the current user's safe public fields, or `user: null`. |
| `POST` | `/api/auth/logout` | Revoke the current session and clear the browser cookie. |

Auth mutation endpoints accept same-origin JSON only. They validate the `Origin` against the request origin, bound request bodies, reject unknown payload fields, and use server-side Zod validation. Login failures use a generic message and perform scrypt work for unknown accounts as well.

## Password and session controls

- Passwords are stored as salted scrypt verifiers; plaintext passwords are never stored or logged. The implementation uses `N=2^14`, `r=8`, `p=5`, a 16-byte random salt, and a 64-byte derived key, which is one of OWASP's documented scrypt fallback configurations. Passwords must be 15–128 Unicode code points; no composition rule is imposed, and passphrases are supported.
- Session tokens use Node's cryptographic random-number generator and contain 256 bits of entropy. Only the SHA-256 token digest is persisted.
- Session cookies are host-only, `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` for HTTPS requests. Sessions expire after seven days; logout revokes the database record.
- The `password_hash` column is nullable to keep the schema upgrade safe for any Phase 2B identity rows that predate local password authentication. Such rows cannot log in with a password until an approved credential is provisioned.
- No signing secret is required for opaque sessions. Do not add the session token or password hash to client state, logs, URLs, or frontend bundles.

## Deliberate boundaries and launch note

This phase establishes identity and session lifecycle only. It does **not** protect dashboard/API resources or validate workflow ownership; that is Phase 2D. Password reset, email verification, MFA, breached-password screening, rate limiting, and production security hardening are also not included. Registration/login are public endpoints, so add and verify abuse/rate controls before exposing public production signups; Phase 9 tracks broader rate limiting and hardening. Do not treat the current UI session indicator as an access-control boundary.

The migration is generated and checked locally, but has not been applied to a live Netlify Database in this environment.

## Development and verification

Run the frontend and Functions through Netlify Dev so `/api/auth/*` routes resolve to the Netlify Functions. The standalone Vite `npm run dev` server does not provide those function routes.

```sh
npm run lint
npm test
npm run build
npx drizzle-kit check
```

Security references: [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html), [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [Netlify Functions API](https://docs.netlify.com/build/functions/api/).
