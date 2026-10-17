---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Signal identity vs mutation
package: ui
fixed: yes
---

### BUG-2026-06-26b — patchNodeFromServer mutates in-place, Angular signals skip re-render

| Field                  | Value                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                                                                                                  |
| **Area**               | ui · bridge-diagram                                                                                                                                                                                                                                                                                                                         |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                       |
| **Symptom**            | Edge disconnects visually after second node move — node stays at old position while edge routes to new position.                                                                                                                                                                                                                            |
| **Repro**              | Connect two nodes → move one node twice → edge appears detached from node.                                                                                                                                                                                                                                                                  |
| **Root cause**         | `patchNodeFromServer` mutated the node object in-place and returned the same reference. `mergeServerNodes` returned a new array with same node references. `SignalModelAdapter.nodes` signal uses `Object.is` — same reference = no re-render. Node visual stayed at old position while edge routing middleware re-ran on updated position. |
| **Fix**                | `patchNodeFromServer` and `patchEdgeFromServer` now return a new spread object when data changes, or short-circuit returning the original reference when nothing changed.                                                                                                                                                                   |
| **Design flaw signal** | **Signal identity vs mutation** — Angular signals use `Object.is` for dirty-checking. Mutable updates that return the same reference are invisible to signals. Always return new objects for signal-tracked state.                                                                                                                          |
| **Regression test**    | `packages/ui/src/app/features/canvas/flow-canvas.component.test.ts` (mergeServerNodes returns new refs when changed, same refs when unchanged); `packages/ui/src/app/services/bridge-diagram.service.ts` exports `mergeServerNodes`, `mergeServerEdges`, `patchNodeFromServer`, `patchEdgeFromServer`                                       |
