---
kind: adr
owner: docs
covers: []
status: current
id: ADR-021
supersedes: []
superseded-by: []
package: docs
---

## ADR-021 — Sub-Agent: registration + port-routed spawn (nodeId filter)

**Status:** accepted · **Date:** 2026-07-20 · **Implementation:** partial
(L0 canvas node + in-node loop shipped; **3-wire protocol superseded** by
epic 41 stage 2 — one `tools` `ToolHandle[]` announcement)

**Context:** Product wants main agents to **delegate** to specialists with
selected skills while keeping Sub-Agents as **first-class canvas nodes**
(transparent to users and runtime). Nested workflow/subgraph runtime is far
future. Hidden in-LLM spawn without graph nodes violates MECHANICS C2/C8 and
the hard-harness product story ([PRODUCT.md](../product/PRODUCT.md)).

**Alternatives considered:**

- **In-LLM spawn only (OpenCode-style)** — model invents sub-agents; no canvas
  topology; skips QA/review stages; rejected for Langflower.
- **Nested workflow / subgraph runtime** — true isolation and reuse; deferred
  (far future).
- **Dynamic spawn outputs per Sub-Agent** — ideal routing; blocked until runtime
  output-extension exists beyond bypass ports.
- **3-wire registration / spawn / result** — L0 shipped, then **superseded**:
  three edges cluttered the canvas; parent `spawn_subagent` plus `callId`
  wait could hang on a missing result wire.
- **Keep map-collect Sub-Agent forever** — useful for fixed body wiring; does
  not expose the specialist to the main LLM as a tool.

**Decision:**

1. **Sub-Agent is a separate node** (`common-sub-agent`, evolve in place).
   Inspector: **multiselect** of skills from `.langflower/skills/*.md`.
2. **One inventory wire** — Sub-Agent emits one `ToolHandle` on OUT
   `subagent-registration` (`TOOL_HANDLE_WIRE_TYPE`). Parent LLM `tools` is
   **multi:combine**.
   `toolId`: slug of `{Inspector name}(subagent)`, else `nodeId`. Duplicate
   `toolId` last-wins (same as packs/MCP). Handle `name` keeps the
   `(subagent)` suffix so weaker models see it is a specialist, not a
   normal tool.
3. **Skills on the handle** — `inputSchema.task` required; `inputSchema.skillId`
   is a JSON Schema `enum` of Inspector `skillIds` when non-empty (omit the
   property when empty). Description lists name + Inspector description +
   skill ids.
4. **`invoke` is the session** — calling the handle runs **this node's**
   `runAgentLoop` and returns a **string** (success or `Error: …`). Unknown
   `skillId` → error string. Timeout: `recovery.subagentTimeoutMs` inside
   invoke (`0` = unlimited, **default**). Stuck specialists use that node's
   LLM recovery (stream idle / autokick); parent `toolTimeoutMs` does not
   apply. Serial per node (ADR-022 L0) — queue overlapping invokes.
5. **No parent spawn ports** — LLM inventory is `tools` + `steerControl` +
   `toolLog` / `recovery`. There is no `spawn_subagent` chat tool, no
   `subagentRegistration` / `subagent` / `subagentResult`.
6. **In-node chat** — Sub-Agent runs the same OpenAI-compatible tool loop /
   session cycle as `common-openai-llm` (own `providerId` / `model` /
   compaction). Nesting = child OUT `subagent-registration` → parent
   Sub-Agent IN `tools`.
7. **Sequential skills / serial invoke** — default concurrency is **serial**
   ([ADR-022](./022-sub-agent-layers-swarm-nested-monte-carlo.md)).
8. **Loop** remains the primitive for dynamic N≥2 map-collect bodies; Sub-Agent
   is the canvas specialist path.

**Superseded (do not reintroduce):** `registration` / `task` / `result` canvas
ports, `spawn_subagent`, `subagent-registration` / `subagent-spawn` /
`subagent-result` wire types, `@langflower/common-nodes/ai/sub-agent-protocol`.
User graphs that still list those edges lose them on load (`droppedEdgeIds`);
there is no migrator.

**Tradeoffs accepted:**

- (+) Canvas-visible specialists + agent-chosen invoke (hard harness topology).
- (+) Result is a normal tool result via `ToolHandle.invoke`.
- (+) Works without nested workflows or dynamic outputs.
- (−) Same `tools` port id in vs out on Sub-Agent (inventory vs announce).
- (−) Duplicate `toolId` last-wins may hide a misnamed specialist.

**Consequences:**

- Normative detail:
  MECHANICS-tool-execution.md (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md`).
- Product summary: [PRODUCT.md](../product/PRODUCT.md).
- Evolve `packages/common-nodes/src/ai/nodes/sub-agent/` + LLM ports; update
  [NODE.md](../../packages/common-nodes/src/ai/nodes/sub-agent/NODE.md).
- Revisit when nested workflows ship — still must not hide specialists
  in-LLM-only.
- Layered extensions (swarm concurrency, nested invoke, Monte Carlo via Loop):
  [ADR-022](./022-sub-agent-layers-swarm-nested-monte-carlo.md).

---
