---
kind: adr
owner: docs
covers: []
status: current
id: ADR-019
supersedes: []
superseded-by: []
package: docs
---

## ADR-019 — ToolHandle invocation, not harness toolId registry

**Status:** accepted · **Date:** 2026-07-20

**Context:** Domain packs (crawl / KB / Memory) were advertised on
`tool-handle` wires by `toolId` only, then invoked through a hidden
`domainHandlers[toolId]` map inside `harness.invoke`. That implies a closed
registry: custom nodes cannot define callable tools without growing the map.
`toolId` must remain only the LLM function name.

**Alternatives considered:**

- **A — Keep harness toolId → handler map** — simple for built-in packs, but
  custom / third-party registration nodes cannot attach invoke without server
  changes. Rejected.
- **B — Graph ports for every tool call** — conflicts with Option 3 (internal
  tool loop). Rejected.
- **C (chosen) — Emit callable `ToolHandle`s** — packs import configs from
  `@langflower/tools`; the loop calls `handle.invoke(args, toolCtx)`. The
  server wraps permitted builtins with an invoker that closes over
  `harness.invoke`.

**Decision:**

1. `ToolHandle.invoke` carries invoke for pack/custom tools.
   `defineToolRegistrations` emits one handle per configured tool.
2. `@langflower/tools/domain-tool-configs` exports
   `CRAWL_TOOL_CONFIGS` / `KB_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS`.
3. `common-nodes` may depend on `@langflower/tools` for those configs only;
   runtime facades still come from `ExecutionContext` / `ToolHandlerContext`.
4. `createProjectHarness.invoke` handles **builtins only**; the server turns
   permitted builtins into `ToolHandle`s (`EC.toolHandles`, omitting
   always-deny tools) before seeding. Wired packs arrive on port `tools`.
   Agent merges EC ∪ port and invokes only `handle.invoke` — no
   `kind: 'harness'` and no agent-side catalog list.
5. Same dual-ingress pattern as MCP: permanent EC ∪ port, not a deferred seed
   into the port.

**Tradeoffs accepted:**

- (+) Extensible: any node can emit a callable registration without a registry.
- (+) No hidden invoke lookup; wire payload is the source of truth.
- (−) `common-nodes` → `tools` dependency (handler wiring only).
- (−) Handlers on the wire are not JSON-serializable (runtime graph only).

**Consequences:**

- `node-factory/define-tool-registrations/`, `run-internal-tool-loop.ts`, Review
  inventory invoke, pack nodes under `common-nodes/{memory,crawl,kb}`.
- Docs: MECHANICS (`docs/_archive/DONE/EPICS/MECHANICS-tool-execution.md`),
  [HOW_TO_WRITE_REACTIVE_NODES.md](../guides/how-to-write-reactive-nodes.md),
  [node-library.md](../product/features/node-library.md) §11.3.

**Revisit trigger:** Need to persist/replay tool registrations across process
boundaries (handlers would need a stable id + reload contract).

---
