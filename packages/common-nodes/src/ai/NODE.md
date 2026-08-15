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

One-file published modules stay at `features/` root (`llm-role-preset.ts`,
`sub-agent-protocol.ts`, `run-host-services.ts`). Specifiers in
`package.json` `exports` are unchanged.

Plan / Coder / Explorer are **instance presets** on `common-openai-llm` /
`common-fake-llm` — not separate palette types.
