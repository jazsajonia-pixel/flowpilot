# Phase 5 implementation references

Consulted on 2026-10-04 for the server-side Gemini provider and AI workflow nodes.

| Topic | Official reference | Decision |
|---|---|---|
| JavaScript SDK | [Google Gen AI SDK libraries](https://ai.google.dev/gemini-api/docs/libraries) and [SDK repository](https://github.com/googleapis/js-genai) | Use Google's GA `@google/genai` SDK from server-only code. The tested v2 SDK requires Node 20 or later; `.nvmrc` pins Node 22. |
| API key | [Gemini quickstart](https://ai.google.dev/gemini-api/docs/get-started) | Read `GEMINI_API_KEY` only from the server environment; never accept it in browser or workflow configuration. |
| Generation API | [Gemini generateContent reference](https://ai.google.dev/api/generate-content) | Use `models.generateContent` with a server-side request budget, optional system instruction, bounded output tokens, and cancellation signal. |
| Structured output | [Gemini structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output) | Send JSON MIME type and a bounded JSON Schema; parse and validate generated JSON locally. |
| Model | [Gemini models](https://ai.google.dev/gemini-api/docs/models) | Default to the stable `gemini-3.8-flash` identifier. Server operators may set `GEMINI_MODEL_ID`. |
| Runtime | [Netlify dependency management](https://docs.netlify.com/build/configure-builds/manage-dependencies/) | Use `.nvmrc` to make the Node major explicit for Netlify builds. |

## Phase 5 boundary

The built-in provider uses one server-managed Gemini key. BYO keys, OpenAI, user-specific credentials, credential encryption, per-user model selection, rate limiting, quotas, and production abuse controls are not part of this phase. Tests inject a fake provider; no live API key or paid model request was used during implementation.
