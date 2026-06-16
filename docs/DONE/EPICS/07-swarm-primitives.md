# Epic 07 — Swarm primitives (Loop / Sub-Agent / Memory)

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md)  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — Sub-Agent / Loop are **external** (C2/C8)

## Goal

Support dynamic fan-out / fan-in for multi-agent graphs without hand-drawing N
copies of every specialist.

Sub-Agent and Loop are **external** topology: control leaves the orchestrating
graph via first-class nodes (criteria **C2 / C8**). There is no hidden manager
that spawns sub-agents inside one LLM session. Each specialist still runs its
**own internal** tool loop (epic 01) with a distinct tool budget (epic 04).
See [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Landed

1. **`common-loop`** (`packages/common-nodes/src/flow/loop/`) — map-collect over
   a runtime list (`items` → `item` → external body → `bodyResult` → `results`
   JSON array). Dynamic N without graph rewrite. Body paced serially so one LLM
   specialist gets a fresh init session per item (ADR-016).
2. **`common-sub-agent`** (`packages/common-nodes/src/ai/sub-agent/`) — landed as
   single external map-collect delegate (`task` → body → `result`). **Target
   evolution** (registration + spawn tool + skills + `nodeId` filter):
   [ADR-021](../../ADR.md#adr-021--sub-agent-registration--port-routed-spawn-nodeid-filter).
   Layers (serial swarm default, nested, Loop MC):
   [ADR-022](../../ADR.md#adr-022--sub-agent-layers-swarm-nested-monte-carlo).
   Loop covers dynamic N≥2 list fan-out without registration.
3. **Memory landed later** — run-scoped store + `common-memory-tools` pack
   (`.langflower/runs/{runId}/memory/`); Loop/Sub-Agent handoff via
   `results` / `result` remains valid without Memory.
4. Catalog entries + unit tests + demos:
    - `demo-project/.langflower/workflows/research-fanout.json`
    - `demo-project/.langflower/workflows/agent-swarm.json`
5. CI fake paths:
    - `tests/integration/ws/execute-research-fanout.ws.test.ts`
    - `tests/integration/ws/execute-agent-swarm.ws.test.ts`
6. Use-case Status → **Partial** for agent-swarm / research-fanout.

## In scope

- Loop and/or Sub-Agent as **external** graph primitives; Memory only if
  required by the chosen design
- Distinct tool budgets per specialist instance (uses epic 04); each instance
  keeps an internal tool loop

## Out of scope

- Crawl content (epic 12)
- Org-wide shared memory
- Hidden in-LLM sub-agent spawn without Sub-Agent / Loop nodes
- Per-call `toolCall` / `toolResult` edges for builtins
- Nested workflow runtime / true parallel N on one body node (serial map-collect
  is the v1 contract)

## Acceptance criteria

1. Dynamic N≥2 specialists can run and merge without graph rewrite. ✅
2. agent-swarm / research-fanout Status updated (Partial or narrowed Missing). ✅
