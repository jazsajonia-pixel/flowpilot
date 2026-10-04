# Phase 4 implementation references

Consulted on 2026-10-04 while implementing bounded manual execution and outbound HTTP actions.

- [Netlify Functions API](https://docs.netlify.com/build/functions/api/) — Web Request handlers, function configuration, background mode, and `context.waitUntil`. `waitUntil` runs within the function's normal execution limit; Phase 4 deliberately returns a complete result from a short bounded request instead.
- [Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/) — Background invocations return `202`, run for up to 15 minutes, and can be retried by the platform. This is a better later option for longer workflows but requires idempotency, persisted progress, and client polling.
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) — Validate IP addresses, consider all A/AAAA answers, prevent DNS rebinding/pinning from bypassing address checks, and do not follow redirects blindly. Since workflow users intentionally configure arbitrary public destinations, production egress controls and abuse limits remain necessary.
- [Node.js HTTPS API](https://nodejs.org/api/https.html) — HTTPS request options, TLS Server Name Indication, and per-request connection handling.
- [Node.js HTTP API](https://nodejs.org/api/http.html) — Custom DNS lookup callback and socket/request timeout behavior.
- [Node.js DNS API](https://nodejs.org/api/dns.html) — Resolve all addresses before connecting with `dns.promises.lookup({ all: true, order: 'verbatim' })`.
- [Node.js Net API](https://nodejs.org/api/net.html) — Built-in IP classification/block-list APIs; this implementation uses `ipaddr.js` public-range classifications instead of maintaining an incomplete CIDR deny list.

## Phase 4 boundaries

Manual runs are synchronous and intentionally bounded. External webhook/schedule triggers, AI nodes, credentials/authorization headers, email/database actions, retries, durable background/queue execution, rate limits, and production abuse monitoring remain later work. Outbound destinations are HTTPS-only on port 443; all resolved addresses must be public unicast, the selected address is pinned to the request connection, redirects are rejected, and request/response sizes and duration are limited. No Netlify deployment or live-database execution was performed.
