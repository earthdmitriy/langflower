# Fake LLM

|              |                   |
| ------------ | ----------------- |
| **Type**     | `common-fake-llm` |
| **Category** | AI                |

## Summary

**Imitates an LLM for the user** (demo pacing, feed UX, deterministic streaming).
The imitate path is **not** a full behavioral twin of `common-openai-llm` (no
compaction seam). The **scripted / injected tool-loop** path accumulates
assistant + feedback user messages like openai-llm (ADR-016).

Streams tokenized **reasoning** and **draftResponse**, then a final **response**.
Harness builtins + wired `tools` (including MCP nodes) are listed in the reasoning text.

**Scripted tool loop (tests):** set param `scriptedToolTurns` to an array of
`{ toolCalls: [...] }` / `{ text: "..." }` turns, or inject
`createChatCompletionStream` on the execution context. The node then runs the
same internal harness invoke loop as openai-llm (`toolLog` + `ctx.harness`) with
session-scoped history across feedback turns.

Same ports / panel shape as openai so graphs wire interchangeably. Init vs
feedback are split (ADR-016: `startWith('')` + `concatMap` on the feedback turn
stream, shared `cycle$`) so Soft↔Hard-style loops do not deadlock. Imitate-only
feedback revises draft/response text; tool-loop feedback appends to history.

Plan / Coder / Explorer are **instance presets** on this one node type — not
separate palette entries.

Not a cloud mock provider — see `docs/features/node-library.md` §14 for the
planned in-process `mock-llm` provider path.

## Inputs

| Port           | Type        | Notes                                                         |
| -------------- | ----------- | ------------------------------------------------------------- |
| `userPrompt`   | string      | required                                                      |
| `systemPrompt` | string      | optional multiline; overrides preset default                  |
| `tools`        | tool-handle | multi combine; packs, MCP nodes, Sub-Agent handles, jsonc MCP |
| `steerControl` | any         | hidden HITL Steer (ADR-032)                                   |
| `feedback`     | string      | optional turn; revises draft / response text                  |

## Outputs

| Port            | Type   | Notes                                                          |
| --------------- | ------ | -------------------------------------------------------------- |
| `reasoning`     | string | streaming feed role `reasoning`                                |
| `draftResponse` | string | streaming feed role `draft`                                    |
| `toolLog`       | string | tool call/result lines; feed role `tool`                       |
| `recovery`      | any    | recovery notices; feed role `recovery`; **hidden** (feed only) |
| `response`      | string | final text; feed role `result`                                 |

No fake emissions; Deny after continue HITL (e.g. `maxFeedbackTurns`) errors
the cycle — see
[LLM_NODES.md](../../../../../../docs/LLM_NODES.md) § Port events.

Wire a Sub-Agent `subagent-registration` output into this `tools` input — the specialist is a
normal `ToolHandle` (epic 41). Do **not** look for `spawn_subagent` ports.

## Params

| Field               | Type                  | Default  | Notes                                                                                                                        |
| ------------------- | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rolePreset`        | select                | `custom` | `custom` \| `plan` \| `coder` \| `explorer` — fills tools + permission posture                                               |
| `providerId`        | select                | —        | from `langflower.jsonc` providers                                                                                            |
| `model`             | select                | —        | per selected provider                                                                                                        |
| `skillId`           | select                | —        | from skills catalog; description caption                                                                                     |
| `includeAgentsMd`   | boolean               | `false`  | when true, append project-root `AGENTS.md` into effective system prompt                                                      |
| `enabledToolIds`    | tool-id-list          | —        | legacy allowlist (migrates to `toolPermissions` when unset)                                                                  |
| `toolPermissions`   | tool-permission-table | —        | deny/ask/allow per tool; unset → role preset; clamped to project floor                                                       |
| `maxIterations`     | number                | `100`    | caps scripted tool-loop rounds **per feedback turn** (`0` = unlimited; no hard product ceiling)                              |
| `maxFeedbackTurns`  | number                | `50`     | max feedback turns after turn 0; `0` = unlimited; further feedback → continue HITL ask (Deny → `toolLog` + `response` error) |
| `tokenDelayMs`      | number                | 40       | delay between tokens (~30s demo at default)                                                                                  |
| `scriptedToolTurns` | (test)                | —        | JSON array of scripted completion turns                                                                                      |

Long multi-paragraph **reasoning** and **draftResponse** templates stream
token-by-token. At the default delay, a typical prompt-only run takes about
**30 seconds** before `response`. Tests should set `tokenDelayMs: 0`.
