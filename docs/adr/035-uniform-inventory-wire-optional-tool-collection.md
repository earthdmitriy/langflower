---
kind: adr
owner: docs
covers: []
status: current
id: ADR-035
supersedes: []
superseded-by: []
package: docs
---

## ADR-035 — Uniform inventory wire + optional Tool collection

**Status:** accepted · **Date:** 2026-08-17

**Context:** After epic 41 stages 1–2, packs, MCP, and Sub-Agent all emit
`ToolHandle[]` on `tool-handle`. LLM `tools` is already `multi: 'combine'`.
Authors with many packs still get a fan-in of edges on the agent. A second
registration type or forcing a hub would split the inventory again.

**Alternatives considered:**

- **Make LLM `tools` single-slot** — every graph needs a hub; extra node on
  starter; rejected (collection must stay optional).
- **Keep only LLM combine, no hub node** — works, but busy canvases have no
  visual grouping of inventory.
- **New wire type / `toolRegistration[]`** — duplicate of `ToolHandle`;
  rejected.

**Decision:**

1. One canvas inventory wire: **`tool-handle` / `ToolHandle[]`**.
2. Optional catalog node **`common-tool-collection`**: IN `tools`
   (`multi: 'combine'`, default `[]`) → OUT `tools` (flattened;
   later slot **last-wins** on `toolId`, same as
   `collectAgentToolHandles`).
3. LLM `tools` stays **`multi: 'combine'`**. Direct pack/MCP/Sub-Agent
   wires remain valid.
4. Skip junk handles; empty → `[]`. Do not throw.

**Tradeoffs accepted:**

- (+) One wire type; hub is opt-in; late MCP connect still merges.
- (−) Duplicate `toolId` silently hides the earlier handle.
- (−) Same port id `tools` in vs out on the collection node.

**Consequences:**

- Node: `packages/common-nodes/src/tools/tool-collection/`.
- Amends [ADR-021](./021-sub-agent-registration-port-routed-spawn-nodeid-filter.md)
  inventory shape (already one `tools` handle) — does not change the canvas
  Sub-Agent node.
- Epic 41 part 3.

---
