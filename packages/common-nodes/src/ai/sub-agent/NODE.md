# Sub-Agent

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-sub-agent` |
| **Category** | AI                 |

## Summary

**L0 shipped** ([ADR-021](../../../../../docs/ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter)):
ordinary OpenAI-compatible agent **plus** a `registration` announce. Parent
spawns arrive on `task` (filtered by `nodeId` / skill); the node runs chat
**in-node** (same tool loop / compaction / inventory as `common-openai-llm`) and
emits `{ callId, result }` on `result` → parent `subagentResult` (≠ `feedback`).

Bake-off / model compare = **N Sub-Agent nodes** on the canvas, each with its
own `providerId` / `model` / `contextSize` — no separate body LLM.

## Inspector

| Param                               | UI                                                                            | Notes                                                |
| ----------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `name` / `description` / `skillIds` | text / multiselect                                                            | Registration identity (+ skills announced to parent) |
| LLM panel                           | provider / model / role / skill / Include root AGENTS.md / tools / iterations | Same as OpenAI LLM                                   |
| Compaction                          | `contextSize` / `compactOnError`                                              | Same as OpenAI LLM                                   |

CI Fake path may set param `scriptedToolTurns` (not Inspector) — same scripted
factory as Fake LLM.

## Ports

| Port                                                        | Dir       | Type                    | Notes                                                                 |
| ----------------------------------------------------------- | --------- | ----------------------- | --------------------------------------------------------------------- |
| `registration`                                              | out       | `subagent-registration` | Announce → parent `subagentRegistration`                              |
| `task`                                                      | in        | `subagent-spawn`        | Ignore if wrong `nodeId` / skill                                      |
| `systemPrompt`                                              | in        | string                  | Optional override / role seed                                         |
| `result`                                                    | out       | `subagent-result`       | `{ callId, result }` → parent `subagentResult`                        |
| `reasoning` / `draftResponse` / `response`                  | out       | string                  | Feed streams (same as OpenAI LLM)                                     |
| `tools` / `mcp` / `subagentRegistration` / `subagentResult` | inventory | —                       | Same as other agents; MCP = ready `McpHandle` only (no config unwrap) |
| `toolLog` / `subagent`                                      | out       | string / spawn          | Real tool facts / nested spawn only                                   |

Wire consts + payload types:
`@langflower/common-nodes/ai/sub-agent-protocol`.

## Graph shape

```text
Sub-Agent.registration ──combine──► Parent.subagentRegistration
Parent.subagent (spawn) ──fan-out──► Sub-Agent.task   # filter by nodeId
packs ──tools/mcp──► Sub-Agent.tools / .mcp
Sub-Agent.result ──merge──► Parent.subagentResult     # ≠ feedback / HITL
```

Spawn: `{ callId, nodeId, skillId, task }`.
Result: `{ callId, result }`.

Layers (swarm serial default, nested recursive ports, Loop Monte Carlo):
[ADR-022](../../../../../docs/ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo).
