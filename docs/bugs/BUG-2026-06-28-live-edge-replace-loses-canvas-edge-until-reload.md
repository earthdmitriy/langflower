---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-28
flaw: Canvas topology mixed optimis...
package: ui
fixed: yes
---

### BUG-2026-06-28 — Live edge replace loses canvas edge until reload

| Field                  | Value                                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-28                                                                                                                                                                                                             |
| **Area**               | ui · canvas · ws                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                  |
| **Symptom**            | Replacing `string -> preview` with `delay -> preview` left stale/disconnected edge state in the live canvas; reloading the tab showed the correct workflow                                                             |
| **Repro**              | In example workflow, connect String to Preview, then connect Delay to the same Preview input; inspect WS `removeEdge.delta` + `addEdge.delta` and compare live canvas with post-reload canvas                          |
| **Root cause**         | Live canvas edge handling treated `removeEdge.delta` and `addEdge.delta` as independent imperative patches against ngDiagram's optimistic model instead of reconciling from the authoritative active workflow topology |
| **Fix**                | `BridgeDiagramService` now coalesces graph topology deltas and reconciles ngDiagram edges from `activeWorkflow.graph` through ngDiagram transaction/model-service lifecycle                                            |
| **Design flaw signal** | **Canvas topology mixed optimistic UI state with server facts** — server-owned graph topology must be projected atomically into ngDiagram, not repaired through local edge supersede heuristics                        |
| **Regression test**    | `packages/ui/src/app/features/canvas/flow-canvas.component.test.ts` — replace, second-tab delta, and optimistic edge reconciliation scenarios                                                                          |
