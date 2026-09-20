# AI category

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **Types**    | `common-openai-llm`, `common-fake-llm`, `common-critique`, `common-review`, `common-sub-agent` |
| **Category** | AI                                                                                             |

## Layout

Catalog entry points live under `nodes/<name>/` (`node.ts` + `NODE.md` + tests).
Shared LLM core lives under `features/` as named slices — not a junk drawer:

- `features/llm-loop/` — generation + stuck / dead-loop recovery
- `features/llm-session/` — session machine + Agent session demux
- `features/path-choice/` — Critique / Review control-tool loop
- `features/openai/` — unbound HTTP factory (server binds secrets)
- `features/ui-schema/` — Inspector panel / recovery / compaction fragments
- `features/prompt/` — system prompt, max-iterations, provider/model resolve
- `features/llm-run-host.ts` — LLM bag type (`createChatCompletionStream`);
  nodes read `ec.chat` from declared caps, not a peek helper

Run-scoped host attach/get lives in `src/run-host/` (`./run-host-services`).
Do not import that bag from `ai/` in embeddings / MCP / files / crawl.

Plan / Coder / Explorer are **instance presets** on `common-openai-llm` /
`common-fake-llm` — not separate palette types.
