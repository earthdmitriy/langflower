---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Run lifecycle ordering
package: runtime
fixed: yes
---

### BUG-2026-06-18 — runtime run result collected before node runners start

| Field                  | Value                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-18                                                                                                                                                                                                                             |
| **Area**               | execution · runtime                                                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                                                                  |
| **Symptom**            | Workflow run finished immediately with empty `nodeOutputs` or wrong terminal status although nodes were still executing.                                                                                                               |
| **Repro**              | Run any workflow through `@langflower/runtime` after server migration; observe `execution.done` resolving before batch/reactive runners produce outputs.                                                                               |
| **Root cause**         | `collectRunResult()` was invoked during `run()` setup before `runner.start()` loop; `done` could resolve against an empty settled graph.                                                                                               |
| **Fix**                | Start all runners first; call `collectActiveRunResult()` after the start loop. On HITL resume, re-collect via `collectActiveRunResult()` instead of reusing stale `pendingRunResult`. File: `packages/runtime/src/workflow-runner.ts`. |
| **Design flaw signal** | **Run lifecycle ordering** — result aggregation must be tied to runner start + interrupt/resume state, not to graph materialization alone.                                                                                             |
| **Regression test**    | `packages/runtime/src/runtime.test.ts`; live smoke: `tests/integration/ws/execute-smoke.ws.test.ts`.                                                                                                                                   |
