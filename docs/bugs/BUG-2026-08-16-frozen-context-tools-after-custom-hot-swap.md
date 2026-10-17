---
kind: bug
owner: docs
covers: []
status: current
date: 2026-08-16
flaw: A port snapshot is not live i...
package: common-nodes
fixed: yes
---

### BUG-2026-08-16 — Frozen `context.tools` after custom hot-swap

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-08-16                                                                                                                                                                                                                                                                                                                                                                    |
| **Area**               | execution · common-nodes · server                                                                                                                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                                         |
| **Symptom**            | After `compile_custom_nodes` hot-swapped a custom `defineToolRegistrations` node, the next `invoke` in the **same** agent turn still ran the previous handler and omitted brand-new `toolId`s.                                                                                                                                                                                |
| **Repro**              | Wire custom tools + compile into Fake-LLM; disk v1 → start → write v2 → scripted `compile_custom_nodes` then custom `toolId`; invoke returned v1.                                                                                                                                                                                                                             |
| **Root cause**         | `runAgentLoop` / `runLlmLoop` froze `tools` from `combineInputs`. After `swapNode`, the LLM `tools` input stayed subscribed to the pre-swap instance (`wireScope` copied `nodesById` at `start()`). Re-reading `context.tools` stayed stale. Pushing a new `tools` port value would `switchMap`-reset ADR-016.                                                                |
| **Fix**                | `getLiveWiredTools` walks current editor inbound `tools` edges (one-shot `value$` subscribe, no LLM input rewire). `getTools` re-reads that list each provider round and `invoke`. Recompile is a wired Langflower Tools bus RPC (`customPalette.update.requested`). Agent `toolCtx` is identity + permission fields only — `buildAgentToolCtx` does not attach the host bag. |
| **Design flaw signal** | A port snapshot is not live inventory across hot-swap; editor `getNode` identity after `swapNode` is not the `wireScope` instance frozen at run start. Ambient host-bag compile would let any wired handler recompile without the tools edge.                                                                                                                                 |
| **Regression test**    | `packages/common-nodes/src/ai/features/llm-loop/run-agent-loop.test.ts` (getTools v1 then v2); `tests/integration/ws/custom-palette-compile-tool.ws.test.ts` (same-run custom invoke returns v2)                                                                                                                                                                              |
