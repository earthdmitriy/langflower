# Phase 6 — Fetch models via OpenAI-compatible API

**Status:** done  
**Depends on:** [Phase 5](llm-nodes-phase-05-openai-llm.md)  
**Index:** [llm-nodes-README.md](llm-nodes-README.md)

## Goal

Populate the model dropdown from the provider’s live catalog using the OpenAI
compatible **list models** API (`GET /v1/models` /
`client.models.list()`), instead of (or in addition to) the static
`provider.*.models` list in `langflower.jsonc`.

## In scope

- Server helper using the same credential resolve + `openai` client as phase 5:
  `listProviderModels(projectDir, providerId) → { id, name? }[]`
- Call only on the server (secrets stay server-side; never send apiKey to UI)
- Bridge: **additive** way for UI to receive fresh model lists — prefer one of:
    - **A (recommended):** new snapshot/event under existing config namespace, e.g.
      `langflower.models.snapshot` with `{ providerId, models }`, triggered by
      client intent `langflower.models.refresh.requested` `{ providerId }`, **or**
    - **B:** embed refreshed `provider[id].models` into a re-emitted
      `langflower.config.snapshot` after refresh (no new event names; merges live
      list into in-memory config slice only — do not write fetched ids back to
      `langflower.jsonc` unless explicitly productized later)
- Inspector: when `providerId` changes (or user triggers refresh), request
  server list; show loading / empty / error without leaking secrets
- Fallback: if list fails or provider has no network, keep static
  `provider.*.models` from jsonc (phase 1 parse)
- Merge policy (locked): **union** of static jsonc models + fetched ids
  (dedupe by id); fetched-only ids remain selectable until next successful
  refresh replaces the dynamic portion
- Docs: `docs/LLM_NODES.md` + `CONFIG.md` — static vs live models; refresh UX;
  bridge contract for the chosen option A or B
- Unit tests with mocked `models.list()`; redact/secret tests unchanged

## Out of scope

- Writing fetched models permanently into `langflower.jsonc`
- Filtering by capability (vision, tools, etc.) beyond what the API returns
- Non-OpenAI-compatible provider catalog APIs
- Auto-poll / `fs.watch`-style background refresh (refresh on provider change +
  explicit refresh is enough)

## Bridge contract (choose A in implementation unless blocked)

| Direction | Event                                 | Payload                                                                                    |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| C→S       | `langflower.models.refresh.requested` | `{ providerId: string }`                                                                   |
| S→C       | `langflower.models.snapshot`          | `{ providerId: string, models: readonly { id: string, name?: string }[], error?: string }` |

If adding routes is undesirable in the same PR style as phases 1–5 (“no new
events”), use option **B** and document that models refresh re-emits
`langflower.config.snapshot` with updated in-memory `provider[id].models` only.

**Default for this phase: option A** (clearer than overloading config snapshot).

## Acceptance criteria

1. With a mocked OpenAI `models.list()` returning ids, Inspector model select for
   that `providerId` shows those ids after refresh (or provider change).
2. Static models from jsonc still appear when fetch fails (fallback).
3. Union/dedupe policy holds: static ∩ fetched merged without duplicates.
4. Refresh path never puts `apiKey` / resolved secrets on any WS payload or
   error string.
5. Bus types in `langflower-bus-config.ts` include the new intent + snapshot
   (option A), or CONFIG/LLM_NODES explicitly documents option B if used.
6. Missing env / provider misconfiguration → user-visible safe error on the
   models snapshot (`error` field), dropdown falls back to static list.
7. Unit tests cover success, failure fallback, and secret non-leak.
8. `docs/LLM_NODES.md` describes live model fetch + when it runs.
9. `dead-code` → `check-exports` → `verify` green.

## Notes / pitfalls

- Depends on phase 5 so the `openai` client + resolve path already exist; do not
  invent a second HTTP stack.
- Some LM Studio / compatible servers return sparse or different model id shapes —
  treat `id` as the select value; `name` optional for titles.
- Do not block canvas editing if models refresh is in flight.
