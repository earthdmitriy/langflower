---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Stream port lifecycle ≠ node...
package: server
fixed: yes
---

### BUG-2026-06-18 — runtime WS bridge emitted agent completed on every stream chunk

| Field                  | Value                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-18                                                                                                                                                                                                                                            |
| **Area**               | execution · server · ws · agent                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                                 |
| **Symptom**            | Multiple `execution.node.completed` events for one Agent run; downstream/toolLog outputs missing or stale in the final completed payload.                                                                                                             |
| **Repro**              | Run Agent with streaming mock LLM over WS; watch `execution.node.completed` for `llm-1` (or agent node id) — one event per stream chunk instead of one at response completion.                                                                        |
| **Root cause**         | `attachRuntimeExecutionSink` / `bridgeOutputPort` called `onNodeCompleted` whenever a port left `pending` after streaming, including non-terminal stream ports (`thoughts`, `draftResponse`).                                                         |
| **Fix**                | Emit `onNodeCompleted` only when a **reactive completion port** (e.g. `response`) transitions `pending → false`, using shared per-node accumulated outputs so `toolLog` is included. File: `packages/server/src/runtime/runtime-execution-events.ts`. |
| **Design flaw signal** | **Stream port lifecycle ≠ node completion** — WS/UI “node completed” must follow semantic completion ports, not every `pending$` edge on streaming outputs.                                                                                           |
| **Regression test**    | Stream settle: `tests/integration/ws/execute-fake-llm.ws.test.ts`. Node-complete waits live in `@langflower/shared/langflower-ws-waits`.                                                                                                              |
