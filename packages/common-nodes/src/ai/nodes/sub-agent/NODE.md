# Sub-Agent

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-sub-agent` |
| **Category** | AI                 |

## Summary

Ordinary OpenAI-compatible agent that announces **one** `ToolHandle` on
`subagent-registration` ([ADR-021](../../../../../../docs/ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter),
epic 41). Parent agents wire that output into their `tools` inventory
and invoke it like any other tool. `invoke` runs this node's in-node chat
(same tool loop / compaction as `common-openai-llm`) and returns a **string**.
Blank specialist completion (empty `response` and no draft/reasoning) becomes
`Error: Sub-Agent returned no content` — never a silent empty string.

Inspector **Skills** (`skillIds`) become the handle `inputSchema.skillId`
enum (omitted when the selector is empty) and are listed in `description`.
Unknown `skillId` → error string, not a hang.

Bake-off / model compare = **N Sub-Agent nodes** on the canvas, each with its
own `providerId` / `model` / `contextSize` — no separate body LLM.

## Inspector

| Param                               | UI                                                                            | Notes                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `name` / `description` / `skillIds` | text / multiselect                                                            | Handle `name` is `{name}(subagent)`; `toolId` is the slug (`Explorer_subagent`)    |
| LLM panel                           | provider / model / role / skill / Include root AGENTS.md / tools / iterations | Same as OpenAI LLM                                                                 |
| Compaction                          | `contextSize` / `compactOnError`                                              | Same as OpenAI LLM                                                                 |
| Recovery                            | including `subagentTimeoutMs`                                                 | `0` = unlimited (default). Optional wall-clock; stuck specialists use LLM recovery |

CI Fake path may set param `scriptedToolTurns` (not Inspector) — same scripted
factory as Fake LLM.

## Ports

| Port                                       | Dir       | Type          | Notes                                                        |
| ------------------------------------------ | --------- | ------------- | ------------------------------------------------------------ |
| `subagent-registration`                    | out       | `tool-handle` | One specialist `ToolHandle[]` → parent `tools` (combine)     |
| `systemPrompt`                             | in        | string        | Optional override / role seed                                |
| `reasoning` / `draftResponse` / `response` | out       | string        | Feed streams (same as OpenAI LLM)                            |
| `tools` / `steerControl`                   | inventory | —             | Nested specialists / packs / MCP into this node (`tools` in) |
| `toolLog` / `recovery`                     | out       | string / any  | Real tool facts / recovery notices (`recovery` is hidden)    |

In is inventory for _this_ loop; out `subagent-registration` is the handle
the parent calls.

## Graph shape

```text
Sub-Agent.subagent-registration ──combine──► Parent.tools
packs / MCP ──tools──► Sub-Agent.tools   # nested inventory
```

Handle: `{ toolId, name, description, inputSchema: { task, skillId? }, invoke }`.
`name` is `{Inspector name}(subagent)` (e.g. `Writer(subagent)`); `toolId` is
the slug (`Writer_subagent`) so OpenAI-compatible function names stay valid.
Description states this is a canvas Sub-Agent, not a regular tool.
The first feed frame from this node closes the caller visit.
`invoke({ task, skillId? })` → non-empty string (success or
`Error: …`).

Layers (swarm serial default, nested recursive `tools`, Loop Monte Carlo):
[ADR-022](../../../../../../docs/ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo).
