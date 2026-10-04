# Phase 6 implementation references

Consulted on 2026-10-05 for server-side BYO provider support and model selection. No live provider request was made.

| Topic | Official source | Implementation note |
|---|---|---|
| OpenAI official JavaScript/TypeScript SDK | https://github.com/openai/openai-node | Uses the Responses API (`responses.create`), `output_text`, request AbortSignal support, explicit timeout, and `maxRetries: 0` to avoid hidden retries in bounded workflow runs. The SDK documents Node.js 22 as its minimum supported version. |
| OpenAI text generation | https://developers.openai.com/api/docs/guides/text | Responses API supports `instructions` and `input`; use the SDK's aggregated `output_text` instead of assuming a fixed output-array shape. |
| OpenAI structured output | https://developers.openai.com/api/docs/guides/structured-outputs | Responses API supports JSON Schema structured output. The provider must obey OpenAI's strict-schema constraints and local validation remains authoritative. |
| OpenAI model catalog | https://developers.openai.com/api/docs/models | Official catalog presents GPT-6 Luna as a cost-sensitive/high-volume choice; model IDs are subject to vendor change and are curated/validated by the application. |
| Gemini model catalog | https://ai.google.dev/gemini-api/docs/models | The official catalog lists `gemini-3.8-flash` as stable; the curated UI includes stable text-generation models only. |

Security boundary: user-supplied keys are accepted only by authenticated same-origin server routes, encrypted with a server environment key before database persistence, never returned after creation, and decrypted only for a server-side provider call. Arbitrary provider URLs are not implicitly trusted and require explicit SSRF-safe design.
