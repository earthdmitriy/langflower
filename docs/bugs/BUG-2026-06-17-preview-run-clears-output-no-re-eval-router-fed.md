---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-17
flaw: Instance topology vs type reg...
package: ui
fixed: yes
---

### BUG-2026-06-17 — Preview ▶ Run clears output, no re-eval (router-fed)

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-17                                                                                                                                                                                                                                                                                                                                                    |
| **Area**               | execution · server · ui                                                                                                                                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                                         |
| **Symptom**            | Clicking ▶ on a Preview node (especially the bottom branch of a dual-channel Router) cleared output or did nothing after the run.                                                                                                                                                                                                                             |
| **Repro**              | String → Router (`ch` + `ch@1`) → two Previews; global run; then ▶ on bottom Preview.                                                                                                                                                                                                                                                                         |
| **Root cause**         | **Three design flaws:** (1) dual execution paths — partial run relied on reactive bus while batch topo skipped bus-fed nodes; (2) Router uses **per-node** `routerChannels` but runner used static type definition (`['ch']` only), so `ch@1` inputs never resolved; (3) UI seed/`mustFresh` contract was split across strip-on-start vs replace-on-complete. |
| **Fix**                | Partial runs: **batch-only path** — materialize Router passthrough into `nodeOutputs` with `resolveWorkflowNodeDefinition`; execute all `mustFresh` batch nodes from cache. Global runs unchanged (bus). UI merges partial-run `nodeOutputs` on completion.                                                                                                   |
| **Design flaw signal** | **Instance topology vs type registry** — dynamic nodes (Router) cannot share a static `NodeDefinition`; partial run must not depend on bus side-effects.                                                                                                                                                                                                      |
| **Regression test**    | Unit: `packages/runtime/src/testing/workflows/router.workflow.test.ts`. Cited `workflow-executor.service.test.ts` and `materialize-passthrough-outputs.test.ts` are deleted.                                                                                                                                                                                  |
