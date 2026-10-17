---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-20
flaw: Init-only seed treated as a l...
package: ui
fixed: yes
---

### BUG-2026-09-20 — Save resets wire paths to default stubs

| Field                  | Value                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-20                                                                                                                                                                                                                                        |
| **Area**               | ui · canvas                                                                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                                             |
| **Symptom**            | After Save, orthogonal wires jump to default stubs. Dragging a node recomputes paths. Load of another workflow is fine.                                                                                                                           |
| **Repro**              | Wire two nodes (auto orthogonal). Save. Edges lose the routed path until a node is dragged.                                                                                                                                                       |
| **Root cause**         | Save broadcasts a new `workflow.current.snapshot` / `graph` object. Same canvas instance re-ran `initializeModel`. Persisted edges have no path points (`persistedEdgeToDiagram` is ids + ports only). Live auto-routing lived only in ngDiagram. |
| **Fix**                | Cache the first `initializeModel` on the canvas instance. Same-id `graphInput` changes return that adapter. Viewport hydrate no longer resets on later snapshots. Load remounts on `workflowId`.                                                  |
| **Design flaw signal** | **Init-only seed treated as a live replace.** Docs already said `graphInput` is seed-only; the computed still rebuilt the model on object identity. Snapshot replace is not a topology fact.                                                      |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/flow-canvas.component.test.ts` (`keeps modelAdapter identity when graphInput is replaced (Save snapshot)`)                                                                                             |
