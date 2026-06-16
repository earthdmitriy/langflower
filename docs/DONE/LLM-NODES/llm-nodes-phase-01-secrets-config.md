# Phase 1 — Secrets, provider config, credential resolve

**Status:** done  
**Depends on:** nothing  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Make LLM provider config safe and usable for UI dropdowns before any LLM node
calls the network. Establish **server-only** credential resolution and snapshot
redaction so keys never reach the bridge or feed.

## In scope

- Parse OpenCode-style `provider.*.models` **object** → `models: string[]` (keys)
  in [`langflower-config.service.ts`](../../packages/server/src/config/langflower-config.service.ts);
  keep string-array form working.
- **Redact helper** used on every `langflower.config.snapshot` and
  `session.state.snapshot.langflowerConfig`: omit `provider.*.options.apiKey`
  (literal and `{env:…}`). UI keeps `name` + `models`.
- **Resolve helper on server** (not in `common-nodes`):
  `{env:VAR}` → `process.env[VAR]`; return `{ apiKey?, baseURL? }` for a
  `providerId`. Safe errors if env missing (no secret echo in messages).
- Update [`docs/CONFIG.md`](../CONFIG.md): official `openai` package (not AI SDK);
  document `{env:}` + redact contract.
- Start [`docs/LLM_NODES.md`](../LLM_NODES.md) with **Secret hygiene** + short
  **Disclaimer** (phases 1–6 ≠ use-cases Agent runtime ready; see
  [llm-nodes-README.md](llm-nodes-README.md)).

## Out of scope

- Skills FS reader, openai node, fake-llm panel changes, wired toggles
- Keychain / encrypting literals in jsonc

## Acceptance criteria

1. Unit: OpenCode object `models` parses to string ids for UI.
2. Unit: config/session snapshot fixtures with `"apiKey": "{env:OPENAI_API_KEY}"`
   (and with a literal key) emit **no** `apiKey` field under `provider.*.options`.
3. Unit: resolve `{env:TEST_LF_KEY}` returns env value; missing env fails with a
   message that does **not** contain the secret or a partial key.
4. Unit/integration: resolved key never appears in any constructed
   `LangflowerConfig` snapshot payload.
5. `docs/CONFIG.md` no longer claims Vercel AI SDK as the chat client.
6. `docs/LLM_NODES.md` exists with secret-hygiene rules
   (host env holds secrets; jsonc stores references; bridge/feed never get resolved keys).
7. `node build/tools/agent-run.mjs verify --quick` (or package-scoped tests covering
   server config) green for touched packages.

## Notes / pitfalls

- Do **not** put resolve in `@langflower/common-nodes` — I/O + secrets stay on server.
- Redacting placeholders from UI is intentional; agents can still read jsonc on disk
  (document honestly: bridge/feed hygiene, not “agents cannot learn the env var name”).
