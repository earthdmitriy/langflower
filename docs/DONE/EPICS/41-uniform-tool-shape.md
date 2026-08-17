# Epic 41 — Uniform tool shape

**Status:** **landed** — MCP as `ToolHandle[]`, Sub-Agent one-wire, and
optional Tool collection.  
**Depends on:** [16-mcp-optional](16-mcp-optional.md) (landed),
[07-swarm-primitives](07-swarm-primitives.md) (landed),
[ADR-021](../../ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter)
(canvas node stays; 3-wire superseded),
[ADR-035](../../ADR.md#adr-035--uniform-inventory-wire--optional-tool-collection).  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md)
— MCP, Sub-Agent, and Tool collection are `ToolHandle[]` on `tools`.  
**Related use-cases:** [node-local-mcp](../../use-cases/node-local-mcp.md),
[agent-swarm](../../use-cases/agent-swarm.md)

# Specification: Uniform tool shape (MCP + Sub-Agent + Tool collection)

## 1. Executive Summary & Intent

- **Problem Statement:** Agents already consume one OpenAI tools array. Canvas
  inventory still uses three parallel contracts (`tool-handle`, `mcp-handle`,
  `subagent-registration` + spawn/result). MCP is flattened to `ToolHandle[]`
  inside `collectAgentToolHandles` before `toChatToolDefinitions`. Sub-Agent
  L0 costs **three wires** (registration / spawn / result), which clutters
  the canvas. Authors need one registration shape and an optional hub that
  merges many packs into one wire.
- **User Prompt Source:** Uniform tool shape: (1) drop separate MCP port type
  — `ToolHandle[]` suits both; (2) expose Sub-Agent as the same registration
  so one tools wire replaces three; (3) QOL node **Tool collection** that
  fans in many `ToolHandle[]` and emits one merged array.
- **External Context:** No Jira / Confluence / Figma in this workspace.
  Product locks: MECHANICS Option 3 (internal loop vs external graph);
  ADR-021 (Sub-Agent stays a **canvas node**; this epic removes the 3-wire
  protocol, not the node). Observation already in code:
  [`collectAgentToolHandles`](../../../packages/common-nodes/src/tools/collect-agent-tool-handles.ts)
  flattens MCP `tools` into the same `ToolHandle[]` that
  [`toChatToolDefinitions`](../../../packages/common-nodes/src/tools/inventory-tool-round.ts)
  sends to the provider.

### Goal (locked)

One canvas wire type for agent inventory: **`tool-handle` / `ToolHandle[]`**.

| Source                          | Today                                     | After                                                            |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `defineToolRegistrations` packs | `tools` → LLM `tools`                     | unchanged                                                        |
| MCP stdio / HTTP                | `mcpTransport` (`mcp-handle`) → LLM `mcp` | `tools` (`tool-handle`) → LLM `tools`                            |
| Sub-Agent                       | 3 wires: registration / spawn / result    | 1 wire: Sub-Agent `tools` out → parent `tools` in                |
| Project jsonc MCP               | `LlmExecutionCaps.mcpHandles`             | flatten into `toolHandles` (no separate caps field on the LLM)   |
| Fan-in QOL                      | LLM `tools` `multi: combine` only         | optional **Tool collection** node + still-allowed direct combine |

Authoring name in the prompt (`toolRegistration[]`) maps to the existing
wire payload **`ToolHandle[]`** (`defineToolRegistrations` / `TOOL_HANDLE_WIRE_TYPE`).
Do not invent a second registration type.

### Compatibility (locked)

- **Losses are acceptable.** No adapter, no port-rename map, no automatic
  rewire of `mcpTransport`→`tools` or the three Sub-Agent edges.
- **User graphs:** existing load repair already drops unbindable edges.
  [`bindWorkflowToSessionEditor`](../../../packages/server/src/workflow/apply-editor-mutation.ts)
  skips `addEdge` failures (`droppedEdgeIds`); the file opens **dirty** with
  a topbar notice. The user reconnects MCP / Sub-Agent inventory by hand.
  Disk is not rewritten until they Save (helper §5b — do not change that).
- **Shipped templates are not user graphs.** Close-out **must** rewrite
  skeleton workflows and amend the Langflower helper skill so new projects
  and the in-product helper tell the one-wire story.

Helper skill facts to rewrite (skeleton SoT, then dogfood):

| Where                    | Today (wrong after this epic)                                    | After                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md` §8            | “Agent sees raw MCP config instead of handles” (keep the Cannot) | MCP **nodes** wire `tools` → agent `tools`; jsonc MCP still Enabled-MCP filtered handles flattened to tools — never raw config          |
| `SKILL.md` §9            | “spawn registration / `subagentResult`”                          | Sub-Agent node stays first-class; **one** `tools` wire into the parent; invoke is a normal tool call; still **not** hidden in-LLM spawn |
| `architecture.md` Agents | “visible spawn” as 3-wire topology                               | Same node-on-canvas story; inventory is `ToolHandle[]`                                                                                  |
| §5b load repair          | strip unknown ports; no invented renames                         | **Keep** — this is how old user graphs lose MCP/Sub-Agent wires                                                                         |

Also update `langflower-workflow-writer` port tables (`subagentRegistration` /
`mcp`) so the writer agent does not re-author the old shape.

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/common-nodes/`
- **Target Directories:**
    - `packages/node-sdk/src/node-factory/define-llm-node/` — drop `mcp` /
      `subagentRegistration` / `subagentResult` / `subagent` from default
      inventory
    - `packages/node-sdk/src/node-factory/define-mcp/` — `McpHandle` stops
      being a **wire** type; may remain an internal tools-package session
      object
    - `packages/common-nodes/src/mcp/` — emit `ToolHandle[]` on `tools`
    - `packages/common-nodes/src/ai/nodes/sub-agent/` — emit `ToolHandle[]`;
      invoke runs the in-node loop
    - `packages/common-nodes/src/ai/nodes/{openai-llm,fake-llm,review,critique}/`
      — stop wiring MCP / subagent inventory
    - `packages/common-nodes/src/ai/features/llm-loop/` +
      `llm-session/` + `path-choice/` — drop `spawn_subagent` /
      `waitForSubagentResult` / `subagentRegistrations`
    - `packages/common-nodes/src/tools/` — `collectAgentToolHandles` (MCP
      flatten at LLM bind goes away); new **tool-collection** catalog node
    - `packages/server/skeleton/workflows/` — **close-out rewrite** of every
      seeded graph that still uses `mcp` / 3-wire Sub-Agent ports (`starter`,
      `simple-coder`, `kb-create`, `kb-navigate`, …). Sync dogfood copies
      under `demo-project/.langflower/workflows/` when that tree is kept in
      lockstep with the skeleton.
    - `packages/server/skeleton/skills/langflower-helper/` — **close-out
      amend** (`SKILL.md` + `architecture.md`). Sync dogfood
      `demo-project/.langflower/skills/langflower-helper/` (same files).
      Also fix `langflower-workflow-writer` port tables if they still list
      `subagentRegistration` / `mcp`.
    - Other docs (see blast radius)
- **Architectural Patterns & Boilerplates Enforced:**
    - Internal tool loop stays the invoke path (MECHANICS). MCP and
      Sub-Agent calls remain **internal** (`toolLog` / feed), not per-call
      canvas edges.
    - Sub-Agent remains a **first-class canvas node** (ADR-021 C5 / C8).
      Only the registration/spawn/result **wires** go away. Hidden
      OpenCode-style in-LLM spawn without a node is still forbidden.
    - `ToolHandle.invoke` closures own session/client/node identity.
      Parent LLM does not route by `nodeId` on the graph.
    - LLM `tools` stays **`multi: 'combine'`** — Tool collection is
      optional QOL, not a mandatory hub.
    - Review `accept` / `feedback` stay **external port-routed** (out of
      scope). Loop stays the map-collect primitive (out of scope).
    - No `index.ts` barrels. New catalog node = `node.ts` + `NODE.md` +
      tests, registered in `catalog.ts`.
    - Expected failures stay Results / port **error** (MCP connect fail
      remains loud — node-local-mcp S5).
- **Pattern & Boilerplate Reference Baseline:**
    - [`defineToolRegistrations`](../../../packages/node-sdk/src/node-factory/define-tool-registrations/define-tool-registrations.ts):
      emit `tools` as `ToolHandle[]` on `TOOL_HANDLE_WIRE_TYPE`.
    - [`collectAgentToolHandles`](../../../packages/common-nodes/src/tools/collect-agent-tool-handles.ts):
      today flattens MCP → `ToolHandle` and last-wins on `toolId`. After
      this epic it only merges `toolsPort` ∪ `toolHandles` (no `mcpPort`).
    - [`toChatToolDefinitions`](../../../packages/common-nodes/src/tools/inventory-tool-round.ts):
      already the OpenAI API mapping — keep; delete
      `buildSpawnSubagentChatTool`.
    - [`mcp-stdio/node.ts`](../../../packages/common-nodes/src/mcp/mcp-stdio/node.ts):
      keep connect/close + `buildMcpHandle`; change output from
      `mcpTransport` / `McpHandle` to `tools` / `handle.tools`.
    - [`buildMcpHandle`](../../../packages/tools/src/mcp/build-mcp-handle.ts):
      keep `<mcp_name>__<tool>` ids and `invoke` → `client.callTool`.
    - [`defaultLlmInventoryInputs`](../../../packages/node-sdk/src/node-factory/define-llm-node/default-llm-ports.ts):
      keep `tools` (combine) + `steerControl`; remove `mcp`,
      `subagentRegistration`, `subagentResult`; remove `subagent` output.
    - [`text/concat/node.ts`](../../../packages/common-nodes/src/text/concat/node.ts):
      multi-slot fan-in pattern. Tool collection uses **`multi: 'combine'`**
      (not zip) so a late MCP connect still merges.
    - [`starter.json`](../../../packages/server/skeleton/workflows/starter.json)
      edges `e-reg-writer` / `e-spawn-writer` / `e-result-writer` — replace
      with one `writer.tools` → `helper.tools`.
- **Third-Party Dependencies & Packages:** None.
- **Frontend Presentation Strategy (If UI Affected):**
    - **Component Library Standards:** Existing lf-node / inspector; no new
      chrome. Port labels follow catalog `NODE.md`.
    - **Styling & CSS Architecture Guardrails:** None (ports only). Palette
      grouping: Tool collection under **Tools** next to MCP / memory-tools.
- **Shared Utilities & Hooks:** Reuse `flattenToolHandles` (already used
  inside `collectAgentToolHandles`) for Tool collection merge. Reuse
  `buildMcpHandle` (do not re-list MCP tools in common-nodes).
- **Internationalization (i18n) Mechanics:** English node `displayName` /
  `description` / Inspector copy only.
- **Environment Configuration (ENV):** None. Project `mcp.servers` in
  `langflower.jsonc` stays; spawn still gated by Inspector **Enabled MCP**.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** LLM default inventory, MCP wire nodes,
  Sub-Agent node, agent loop spawn path, skeleton/demo workflows, inspector
  MCP vs tools copy, helper / workflow-writer skills, use-cases, ADR-021
  amendment, MECHANICS class table.
- **Affected Files Inventory:**
    - **New Files:**
        - `packages/common-nodes/src/tools/tool-collection/node.ts` —
          `common-tool-collection`: combine `tools` slots → one
          `ToolHandle[]`
        - `packages/common-nodes/src/tools/tool-collection/NODE.md`
        - `packages/common-nodes/src/tools/tool-collection/node.test.ts`
        - `docs/ADR.md` — new ADR (uniform inventory wire) amending
          ADR-021 wire protocol
    - **Changed Files (representative):**
        - `define-llm-node/default-llm-ports.ts`, `llm-inventory-wire.ts` —
          drop MCP / subagent inventory ports and `subagent` out
        - `define-reactive-node/types.ts` — `LlmExecutionCaps` drops
          `mcpHandles` (flatten at server bind into `toolHandles`)
        - `mcp-stdio/node.ts`, `mcp-http/node.ts` — output `tools`
        - `sub-agent/node.ts` — output `tools` (`ToolHandle[]`); `invoke`
          runs in-node chat; drop `registration` / `task` / `result`
        - `run-agent-loop.ts`, `run-llm-loop.ts`,
          `run-reactive-path-choice-loop.ts` — no
          `subagentRegistrations` / `waitForSubagentResult` /
          `buildSpawnSubagentChatTool`
        - `collect-agent-tool-handles.ts` — tools ∪ EC toolHandles only
        - `catalog.ts` — register tool-collection
        - `packages/server/src/bridge/bind-llm-context.ts` (or equivalent) —
          jsonc MCP → `toolHandles`
        - Skeleton + dogfood workflows (close-out, not optional): `starter`,
          `simple-coder`, `kb-create`, `kb-navigate`, and any other graph
          still using `mcpTransport` / `subagentRegistration` / `task` /
          `result` / `subagent` / `subagentResult`
        - Tests: MCP stdio/http node tests, openai-mcp-tool-loop,
          agent-swarm / subagent WS tests, LLM port contract tests
        - Docs: MECHANICS, ADR-021, HOW_TO_WRITE_REACTIVE_NODES, NODES,
          node-library, GLOSSARY, node-local-mcp, agent-swarm, sub-agent
          NODE.md, MCP NODE.md
        - Helper KB (close-out, required): skeleton + dogfood
          `langflower-helper` (`SKILL.md` §5b / §8 MCP / §9 Sub-Agent;
          `architecture.md` Agents on the canvas). Workflow-writer skill
          port table if it still documents the 3-wire shape.
    - **Deleted Files:** Prefer delete dead helpers in the same change:
      `buildSpawnSubagentChatTool`, `wait-for-subagent-result.ts` (if
      unused), `flattenMcpHandles` (if unused), sub-agent protocol **wire**
      consts if no remaining consumers. Keep payload types only if invoke
      still uses them internally.
- **Backward Compatibility Plan:** **Breaking** graph contract. **Losses
  are acceptable** — do not write a migrator or compatibility shim.
    1. **User-saved workflows:** load validation already strips incompatible
       wires. `bindWorkflowToSessionEditor` calls `editor.addEdge`; a false
       return (unknown port, type mismatch, vanished `mcp` /
       `subagentRegistration` / …) appends `droppedEdgeIds`. Nodes stay;
       those edges vanish; graph is dirty until Save. User reconnects
       MCP `tools` → agent `tools` and Sub-Agent `tools` → parent `tools`.
       Helper §5b already states this: strip only, never invent port
       renames, never rewrite disk on load.
    2. **Skeleton / demo templates:** not covered by (1). At epic close-out
       **rewrite** every seeded workflow JSON to the one-wire shape so a
       fresh `langflower start` is not a repair notice.
    3. **Langflower helper skill:** amend Can / Cannot so the in-product
       helper does not teach `mcpTransport` → `mcp` or the three Sub-Agent
       wires. Sync dogfood.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** `ToolHandle` in
  `@langflower/node-sdk` (`tool-handle.ts`). Wire const
  `TOOL_HANDLE_WIRE_TYPE = 'tool-handle'`.
- **Data Access Layer (DAL) Pattern:** N/A (graph ports, not persistence).
- **Endpoints & Routes Impacted:** None (WS protocol unchanged). Workflow
  JSON `fromPort` / `toPort` ids change in seeded files.
- **Data Contracts (Schemas & Type Specs):**

```typescript
// Unchanged wire payload (packs, MCP, Sub-Agent, collection out)
type ToolHandle = {
	readonly toolId: string;
	readonly name: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly invoke: ToolHandler;
};

// MCP node (stdio / http)
// out tools: ToolHandle[]  // = buildMcpHandle(...).tools; session stays in closures

// Sub-Agent node
// out tools: ToolHandle[]  // typically one handle bound to this instance
// ToolHandle.toolId: stable id from Inspector name (fallback nodeId), unique on the canvas
// ToolHandle.inputSchema:
// {
//   type: 'object',
//   properties: {
//     task: { type: 'string', description: 'Task for this specialist' },
//     skillId: { type: 'string', description: 'Optional skill id announced by this node' },
//   },
//   required: ['task'],
// }
// invoke({ task, skillId? }) → run this node's in-node agent loop → result string

// Tool collection
// in  tools: ToolHandle[]   multi: 'combine', default []
// out tools: ToolHandle[]   flattened; later slot last-wins on toolId (same as collectAgentToolHandles)
```

- **Wrapper Strategy:**
    - **Reuse as-is:** `ToolHandle`, `defineToolRegistrations`,
      `toChatToolDefinitions`, `buildMcpHandle`, MCP clients, in-node
      `runAgentLoop`.
    - **Amend:** `defineLlmNode` inventory; MCP node output; Sub-Agent
      bind; `collectAgentToolHandles`; `LlmExecutionCaps`; skeleton
      workflows.
    - **New:** `common-tool-collection`.
    - **Delete:** canvas `mcp-handle` wire; LLM `mcp` / subagent inventory
      ports; synthesized `spawn_subagent` chat tool; parent
      `waitForSubagentResult` router.
- **Reverse Compatibility Risk Matrix:**
    - Old `mcpTransport` → `mcp` edges: **dropped on load** (port gone /
      wire type mismatch). User reconnects `tools` → `tools`. Acceptable.
    - Old 3-wire Sub-Agent: **dropped on load**. User reconnects one
      `tools` edge. Acceptable. Topology (Sub-Agent node still on canvas)
      is kept; only the three edges disappear.
    - Custom nodes that imported `McpHandle` / `MCP_HANDLE_WIRE_TYPE` /
      `sub-agent-protocol` wire consts: compile break — update NODE.md +
      HOW_TO_WRITE_REACTIVE_NODES (authoring, not a workflow migrator).
    - `enabledMcpIds` Inspector: **keep** for jsonc project MCP (S4). It
      selects which servers spawn; those servers’ tools land on
      `toolHandles`, not a `mcp` port.
    - Skeleton JSON left on the 3-wire shape: **not acceptable** — that is
      a close-out defect, not a user-graph loss.

### C. Security, Identity & Compliance

- **Authentication & Authorization:** MCP allowlist / jsonc trust model
  unchanged (epic 16). Sub-Agent invoke still runs that node’s own
  provider/model/permissions. Permission `ask` stays on the internal loop.
- **Data Privacy & Multi-Tenancy:** N/A (local project). Closures must not
  leak MCP clients across graph nodes; each MCP node still owns connect /
  unsubscribe-close.

### D. Dataflow Architecture & Evolution

- **State Lifecycle & Pipeline:**

**MCP**

```text
MCP node bind
  → connect (stdio/http)
  → buildMcpHandle (list + bind invoke)
  → emit tools: handle.tools
  → (optional) Tool collection combine
  → LLM tools combine
  → collectAgentToolHandles (port ∪ jsonc toolHandles)
  → toChatToolDefinitions → provider
  → tool call → ToolHandle.invoke → MCP client.callTool
```

**Sub-Agent (1 wire)**

```text
Sub-Agent bind
  → emit tools: [ specialistHandle ]   // closure over this instance
  → parent LLM tools
  → model calls specialist toolId
  → invoke(task, skillId?)
      → this node's in-node runAgentLoop (own inventory / provider)
      → return result string as tool result
  → parent loop continues (feed/toolLog on parent + Sub-Agent rows)
```

Canvas after starter rewrite:

```text
Langflower Tools.tools ──► Helper.tools
Writer.tools            ──► Helper.tools     (was 3 wires)
optional Tool collection as a visual hub
```

- **State Authority:** Live `ToolHandle.invoke` on the producing node.
  Parent LLM never holds `McpHandle` or `SubAgentRegistration`.
- **Schema Evolution & Migration:** No DB. No user-graph migrator. Load
  path already drops unbindable edges (`droppedEdgeIds`). **Must** rewrite
  skeleton workflow JSON at close-out so templates do not rely on that
  repair. **Must** amend `langflower-helper` (and dogfood) so Can / Cannot
  match the new wires.

### E. Validations & Boundary Conditions

- **Input Validation Schemas:** Tool collection / LLM combine already
  flatten arrays-of-arrays (multi combine). Guard non-handle values the
  same way `flattenToolHandles` does today (skip junk; do not throw).
- **Zero / Empty States:**
    - Unwired LLM `tools` → `[]` (unchanged).
    - MCP command/url empty → `EMPTY` (no silent empty inventory pretending
      success). Connect fail → port **error** (S5).
    - Sub-Agent with no parent wire: node idle; no spawn tool on anyone.
    - Tool collection with no slots → `[]`.
- **Extreme Constraints:**
    - Duplicate `toolId` across packs/MCP/subagents: **last-wins** (document
      in NODE.md). Authors should use Tool collection + distinct names.
    - Sub-Agent `invoke` timeout: reuse `recovery.subagentTimeoutMs` (or
      tool timeout) inside invoke — do not hang the parent loop forever
      (closes MECHANICS L0 “miswired wait for subagentResult” gap).
    - Nested specialists: wire child `tools` into the Sub-Agent’s **input**
      `tools` (its own inventory). Output `tools` is the announcement pack
      only — in vs out same id is allowed.

### F. Concurrency & State Collisions

- **Race Condition Mitigation:** Default Sub-Agent invoke stays **serial
  per parent tool loop** (ADR-022 L0 serial). Parallel swarm is still a
  later layer — do not add `parallel-by-nodeId` here. MCP client: one
  session per MCP node; unsubscribe closes the process. Tool collection
  `combine` re-emits when any slot updates (MCP connect late is OK).

### G. Error Handling & Resiliency

- **Expected Failure Modes:** MCP connect/initialize fail → MCP `tools`
  port error (agent does not start with a hole). Sub-Agent invoke fail /
  timeout → tool **error string** into the parent loop (C9 internal), not
  a missing `subagentResult` hang. Duplicate toolId last-wins may hide a
  pack — document, do not auto-prefix (MCP already prefixes).
- **Graceful Degradation:** No MCP / no Sub-Agent wire → agent runs with
  remaining tools. Tool collection optional.
- **Telemetry, Logging & Observability:** Sub-Agent activity stays
  node-labeled in the feed (agent-swarm S1). Parent `toolLog` records the
  specialist tool call; Sub-Agent still emits reasoning/response on its
  own feed ports.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** MCP nodes emit `tools` `ToolHandle[]`; collection
      merge + last-wins; Sub-Agent emits one handle; `collectAgentToolHandles`
      has no `mcpPort`; `toChatToolDefinitions` has no `spawn_subagent`; LLM
      default ports omit `mcp` / subagent inventory.
- [x] **Integration Testing:** Existing openai-mcp-tool-loop (wire
      `tools`→`tools`); Sub-Agent spawn via one tools edge (starter / swarm
      WS); jsonc Enabled MCP still injects tools without a `mcp` port.
- [ ] **E2E / Smoke Testing:** Not required.
- [x] **Manual Verification:** Canvas wiring script below.

### B. Manual Verification Script

#### Test Case 1: MCP is just tools

- **Prerequisites:** MCP stdio fixture (echo server) + OpenAI-compatible
  Fake or scripted LLM.
- **Step-by-Step Actions:**
    1. Place MCP stdio + LLM. Wire `mcp.tools` → `llm.tools` (not `mcp`).
    2. Confirm canvas rejects a leftover `mcp` port (gone).
    3. Run; model calls the MCP tool.
- **Expected Output / Observable Result:** Inventory includes
  `<mcp_name>__<tool>`; invoke hits the fixture; feed shows toolLog. No
  `mcp-handle` wire type in the palette compatibility set.

#### Test Case 2: Sub-Agent is one tools wire

- **Prerequisites:** Skeleton `starter` (Helper + Writer Sub-Agent).
- **Step-by-Step Actions:**
    1. Confirm only **one** edge Writer → Helper inventory (`tools`→`tools`).
    2. No `registration` / `task` / `result` / `subagent` / `subagentResult`
       ports on the nodes.
    3. Run; Helper calls the Writer tool with a task.
- **Expected Output / Observable Result:** Writer runs as its own node in
  the feed; Helper receives the result as a normal tool result; canvas is
  not a three-edge bundle.

#### Test Case 3: Old user graph — load strips, user reconnects

- **Prerequisites:** A saved workflow JSON that still has
  `mcpTransport`→`mcp` and/or the three Sub-Agent edges (copy a pre-epic
  `starter.json` into a scratch project).
- **Step-by-Step Actions:**
    1. Open the workflow after this epic’s port change.
    2. Note the load-repair notice and dirty document; inspect dropped
       edges (MCP / registration / spawn / result gone).
    3. Reconnect MCP `tools` → LLM `tools` and Sub-Agent `tools` → parent
       `tools`. Save.
- **Expected Output / Observable Result:** File opens (not rejected).
  Incompatible wires are gone; nodes remain. After reconnect + Save, run
  works. Disk unchanged until Save.

#### Test Case 4: Tool collection hub

- **Prerequisites:** Two tool packs (e.g. memory-tools + MCP) + LLM.
- **Step-by-Step Actions:**
    1. Wire both packs into Tool collection `tools` (two slots).
    2. Wire collection `tools` → LLM `tools` (single edge).
    3. Run and call one tool from each pack.
- **Expected Output / Observable Result:** LLM inventory is the union;
  duplicate `toolId` last-wins. Direct multi-wire into LLM `tools` still
  works without the collection node.

### C. Functional Requirements Checklist

- [x] MCP stdio/http emit `tools: ToolHandle[]` (`tool-handle`); output
      port id `tools` (replace `mcpTransport`).
- [x] LLM default inventory has no `mcp` input; jsonc MCP lands as
      `toolHandles`.
- [x] `McpHandle` / `mcp-handle` is not a canvas wire type.
- [x] Sub-Agent emits `tools: ToolHandle[]`; `invoke` runs the in-node loop
      and returns a string; skills optional via `skillId`.
- [x] Parent LLM has no `subagentRegistration` / `subagent` / `subagentResult`
      ports; no `spawn_subagent` chat tool.
- [x] Sub-Agent remains a palette canvas node (not in-LLM-only spawn).
- [x] `common-tool-collection` combines multi `tools` into one
      `ToolHandle[]` (combine, last-wins on `toolId`, empty → `[]`).
- [x] LLM `tools` stays `multi: combine` (collection optional).
- [x] No workflow migrator / port-rename map. User graphs lose old wires
      via existing load strip (`bindWorkflowToSessionEditor`); user
      reconnects.
- [x] **Close-out — skeleton workflows:** rewrite
      `packages/server/skeleton/workflows/` (`starter`, `simple-coder`,
      `kb-create`, `kb-navigate`, …) to one-wire `tools`; sync dogfood
      copies. A fresh seed must not open with a repair notice for these
      edges.
- [x] **Close-out — Langflower helper skill:** amend skeleton
      `langflower-helper` `SKILL.md` + `architecture.md` (and dogfood):
      MCP wires to agent `tools`; Sub-Agent is one `tools` edge (not
      registration / spawn / `subagentResult`); keep §5b strip-only load
      repair. Update workflow-writer port tables if they still list the
      old inventory ports.
- [x] Other docs (ADR-021, MECHANICS, use-cases, NODE.md) match Can/Cannot.
- [x] **`npm run test`** at close-out.

### Verify

- Intermediate (optional): focused vitest on MCP / Sub-Agent / collection /
  `verify --quick` during the loop.
- **Close-out (required):** `npm run test` or full `verify` — unit **and**
  integration (MCP tool-loop + Sub-Agent / starter WS). Do not mark the
  epic done on `--quick` alone.

---

## Appendix — architecture summary

```text
Packs / MCP / Sub-Agent / custom defineToolRegistrations
        │  ToolHandle[]  (tool-handle)
        ▼
   [optional Tool collection]  ─ combine + last-wins toolId
        │
        ▼
   LLM.tools  (multi: combine)  ∪  jsonc MCP toolHandles
        │
        ▼
   toChatToolDefinitions  →  OpenAI tools[]
        │
        ▼
   ToolHandle.invoke   (internal loop + toolLog)
```

**Explicitly out of scope**

- Review `accept` / `feedback` port-routed control tools
- Loop map-collect
- Nested workflow files / ADR-022 L1 parallel swarm
- Auto-migrator / silent port rename for old **user** graphs (load strip +
  manual reconnect is the product; losses acceptable)
- Making LLM `tools` single-slot (would force the collection node)
- Replacing builtins with MCP
- Changing load-repair policy (still strip-only, dirty, Save to persist;
  helper §5b)
