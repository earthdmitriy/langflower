# Epic 03 — Review node (`accept` / `feedback` tools)

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md)  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — **external** / port-routed control tools  
**Detail sketch:** [../LLM-NODES/llm-nodes-phase-07-review-node.md](../LLM-NODES/llm-nodes-phase-07-review-node.md)

## Goal

Ship a **separate** Review node (not a role preset). Forced tool use:
`accept` / `feedback` route to output ports; free-form text is rejected with a
harness reminder.

This is the first concrete **external** layer: port-routed control tools
(class B). Criteria **C1 / C3 / C9** — ownership and typed payload leave the
node via ports, not chat tool-result messages alone. See
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Delivered

1. `common-review` in `catalog.ts` — forced tools `accept` / `feedback` only.
2. Port routing: `accept` → `response` (passthrough `result`); `feedback` →
   `feedback` port (notes). No harness invoke for control tools.
3. Text-only → reminder on `toolLog` + continue loop; fail-closed after
   `maxIterations`.
4. Unit tests: feedback port, accept passthrough, reminder path, fail-closed.
5. NODE.md + LLM_NODES + use-case Missing notes updated where Review was listed.

## Follow-ons (not this epic)

- Wire into article-writing / adversarial / prompt-refining sample graphs
  (epic 05).
- Role tool profiles (epic 04); multi-gate HITL clearance (use case).

## In scope

- `common-review` + two built-in control tools only
- Forced-tool prompt + `maxIterations` fail-closed
- Port routing: tool name → output port (external contract)

## Out of scope

- MCP on Review
- Multi-gate human approval (graph gates; not persona identity)
- Generic internal tool-loop for builtins (epic 01)
- Per-call edges for `read`…`bash`

## Acceptance criteria

Same as phase-07 acceptance list; additionally link this epic from use-cases
that listed Review as Missing.
