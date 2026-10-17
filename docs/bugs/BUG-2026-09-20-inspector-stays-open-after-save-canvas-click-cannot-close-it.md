---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-20
flaw: Local host selection ≠ server...
package: ui
fixed: yes
---

### BUG-2026-09-20 — Inspector stays open after Save; canvas click cannot close it

| Field                  | Value                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-20                                                                                                                                                                                                                                                                                                                               |
| **Area**               | ui · canvas · inspector                                                                                                                                                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                    |
| **Symptom**            | Select a node (inspector opens), Save the workflow, click empty canvas — inspector stays. Before Save, the same click closed it.                                                                                                                                                                                                         |
| **Repro**              | Click a node → Save → click the canvas background.                                                                                                                                                                                                                                                                                       |
| **Root cause**         | Save broadcasts a new `workflow.current.snapshot` without clearing `selectedNode`. Same-id graph identity still reseeds `initializeModel`, which wipes ngDiagram selection **without** `selectionChanged`. `lastConfirmedSelectedNodeId` stayed the node, so a later empty-canvas click was a no-op. Inspector follows server selection. |
| **Fix**                | After `modelAdapter` reseed, re-apply the last confirmed selection once the new model commits. Inspector **Close** emits `editor.selectNode.requested` `{ nodeId: null }`.                                                                                                                                                               |
| **Design flaw signal** | **Local host selection ≠ server selection after a snapshot reseed.** A loop guard that skips “same as last confirmed” assumes the diagram still holds that selection. Snapshot replace can drop the host copy without emitting the change the guard waits for.                                                                           |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/flow-canvas.component.test.ts` (`re-applies the confirmed selection after a same-id graph reseed`); `packages/ui/src/app/features/sidebar/tests/lf-inspector-panel.description.test.ts` (`emits editor.selectNode.requested null from Close`)                                                 |
