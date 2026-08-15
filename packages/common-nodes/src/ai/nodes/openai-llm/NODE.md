# OpenAI-compatible LLM

|              |                     |
| ------------ | ------------------- |
| **Type**     | `common-openai-llm` |
| **Category** | AI                  |

## Summary

Streams **real** chat completions from an OpenAI-compatible HTTP API (official
`openai` npm package on the server). Same Inspector panel and ports as
`common-fake-llm`, minus `tokenDelayMs`.

**Session model (ADR-016):** init ports build agent context; each init re-emission
starts a **new** session (clears history). `feedback` is **not** an init peer —
turn 0 is primed with `feedback.pipe(startWith(''), concatMap…)` so Soft↔Hard
loops do not deadlock; later non-empty feedback appends to conversation history
(full history sent every turn until compaction shrinks it via `historySync`).
One shared `cycle$` (`shareReplay`) fans out to reasoning / draft / toolLog /
response.

**OpenAI-compatible** means any provider with a compatible REST API — set
`options.baseURL` in `langflower.jsonc` (LM Studio, local proxies, OpenAI, …).

Credentials resolve **only on the server** via `resolveProviderCredentials`;
the node calls `ExecutionContext.createChatCompletionStream` and never sees
`apiKey` values.

**Internal tool loop (epics 01 / 16):** allowlisted builtins from
`ExecutionContext.harness` (`@langflower/tools`), wired registrations, and
MCP tools (ready `McpHandle` values from `EC.mcpHandles` ∪ port `mcp`) are
passed to the chat API as `tools`. The node never expands MCP server config.
When the model returns `tool_calls`, the node invokes handlers / `ctx.harness`,
appends tool results, and re-completes until final text or `maxIterations`.
Observability is the `toolLog` feed port — not per-call
canvas edges. MCP is optional and never a substitute for builtins.

Plan / Coder / Explorer are **instance presets** on this one node type — not
separate palette entries.

## Inputs

| Port                   | Type                    | Notes                                             |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `userPrompt`           | string                  | required; init — change recreates session         |
| `systemPrompt`         | string                  | optional multiline; init                          |
| `tools`                | tool-registration       | multi combine; merged with harness builtins       |
| `subagentRegistration` | `subagent-registration` | multi combine; `SubAgentRegistration[]` (≠ tools) |
| `subagentResult`       | `subagent-result`       | multi merge; `{ callId, result }` router          |
| `mcp`                  | mcp-handle              | multi combine; ready handles (+ `EC.mcpHandles`)  |
| `feedback`             | string                  | turn input (not init); advances history           |

## Outputs

| Port            | Type             | Notes                                                                                 |
| --------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `reasoning`     | string           | API reasoning tokens (`delta.reasoning` / `reasoning_content`); feed role `reasoning` |
| `draftResponse` | string           | streamed API content tokens; feed role `draft`                                        |
| `toolLog`       | string           | real tool call/result lines only; feed role `tool`                                    |
| `response`      | string           | final assembled text; feed role `result`                                              |
| `subagent`      | `subagent-spawn` | `SubAgentSpawnPayload` when `spawn_subagent` runs                                     |

No fake emissions; Deny after continue HITL (e.g. `maxFeedbackTurns`) errors
the cycle — see
[LLM_NODES.md](../../../../../../docs/LLM_NODES.md) § Port events.

Custom Sub-Agent peers: import wire consts from
`@langflower/common-nodes/ai/sub-agent-protocol`.

## Params

| Field              | Type                  | Default  | Notes                                                                                                                        |
| ------------------ | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `rolePreset`       | select                | `custom` | `custom` \| `plan` \| `coder` \| `explorer` — fills tools + permission posture                                               |
| `providerId`       | select                | —        | from `langflower.jsonc` providers                                                                                            |
| `model`            | select                | —        | per selected provider                                                                                                        |
| `skillId`          | select                | —        | from skills catalog                                                                                                          |
| `includeAgentsMd`  | boolean               | `false`  | when true, append project-root `AGENTS.md` into effective system prompt                                                      |
| `enabledToolIds`   | tool-id-list          | —        | legacy allowlist (migrates to `toolPermissions` when unset)                                                                  |
| `toolPermissions`  | tool-permission-table | —        | deny/ask/allow per tool; unset → role preset; clamped to project floor                                                       |
| `maxIterations`    | number                | `100`    | caps internal tool-loop rounds **per feedback turn** (`0` = unlimited; no hard product ceiling)                              |
| `maxFeedbackTurns` | number                | `50`     | max feedback turns after turn 0; `0` = unlimited; further feedback → continue HITL ask (Deny → `toolLog` + `response` error) |
| `contextSize`      | number                | `200000` | approx input token budget (`chars/4` of messages+tools); `0` disables proactive compaction                                   |
| `compactOnError`   | boolean               | `false`  | on context-length create error: force-compact once and retry before failing                                                  |

Selecting a role preset materializes `enabledToolIds` (Inspector). Runtime
permission posture overlays project `permission` per role. Merge rules:
[docs/LLM_NODES.md](../../../../../../docs/LLM_NODES.md).

**Context compaction:** when the request estimate exceeds ~80% of `contextSize`,
the node summarizes contiguous unprotected history via a no-tools completion,
emits `historySync`, then continues. `compactOnError` covers servers whose
window is smaller than `contextSize`. Sub-Agent owns the same compaction
params in-node (no separate body LLM).

Run cancel (`runner.interrupt`) aborts in-flight HTTP streams best-effort via
`AbortSignal`.

See [docs/LLM_NODES.md](../../../../../../docs/LLM_NODES.md) and
[docs/ADR.md](../../../../../../docs/ADR.md) ADR-016 /
[epic 04](../../../../../../docs/DONE/EPICS/04-role-tool-profiles.md).
