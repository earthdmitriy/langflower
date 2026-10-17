---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Output bus is global mutable...
package: shared
fixed: yes
---

### BUG-2026-06-18 — partial run reused stale output-bus values (router / mustFresh)

| Field                  | Value                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-18                                                                                                                                                                                                                                                                                                         |
| **Area**               | execution · runtime · shared · router                                                                                                                                                                                                                                                                              |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                              |
| **Symptom**            | Partial run from a Preview/Router branch used outputs from a previous global run; router partial run skipped re-execution.                                                                                                                                                                                         |
| **Repro**              | Global run on dual-channel Router workflow; then `execute.start` with `fromNodeId` on one branch Preview — wrong cached values or router not in executable set.                                                                                                                                                    |
| **Root cause**         | (1) `RuntimeOutputBus` retained prior run values for nodes in partial scope. (2) `buildPartialRunPlan` / `mustFresh` did not include upstream Router nodes on selective downstream walks (fixed via `getSelectiveDownstreamNodeIds` including router nodes).                                                       |
| **Fix**                | `outputBus.resetRunOutputs(scope.executableNodeIds)` at run start. Router nodes included in partial `mustFresh` set. Files: `packages/runtime/src/output-bus.ts`, `packages/runtime/src/workflow-runner.ts`, `packages/shared/src/execution/partial-run-plan.ts`, `packages/shared/src/router/router-channels.ts`. |
| **Design flaw signal** | **Output bus is global mutable state** — partial runs need explicit scope reset and instance topology (Router channels) in the fresh set, not only batch seed cache.                                                                                                                                               |
| **Regression test**    | Unit: `packages/runtime/src/testing/workflows/router.workflow.test.ts`, `packages/common-nodes/src/flow/router/router.test.ts`. Partial `startNode` WS: `tests/integration/ws/execute-workflow.ws.test.ts` (string→preview cluster, not router channels).                                                          |
