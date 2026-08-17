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

Inspector **Skills** (`skillIds`) become the handle `inputSchema.skillId`
enum (omitted when the selector is empty) and are listed in `description`.
Unknown `skillId` → error string, not a hang.

Bake-off / model compare = **N Sub-Agent nodes** on the canvas, each with its
own `providerId` / `model` / `contextSize` — no separate body LLM.

## Inspector

| Param                               | UI                                                                            | Notes                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `name` / `description` / `skillIds` | text / multiselect                                                            | Handle identity (`toolId` = slug of `name`, else `nodeId`) |
| LLM panel                           | provider / model / role / skill / Include root AGENTS.md / tools / iterations | Same as OpenAI LLM                                         |
| Compaction                          | `contextSize` / `compactOnError`                                              | Same as OpenAI LLM                                         |
| Recovery                            | including `subagentTimeoutMs`                                                 | Invoke timeout → error string into the parent loop         |

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
`invoke({ task, skillId? })` → string (success or `Error: …`).

Layers (swarm serial default, nested recursive `tools`, Loop Monte Carlo):
[ADR-022](../../../../../../docs/ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo).
