---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Coordinate space mismatch
package: ui
fixed: yes
---

### BUG-2026-06-26f — palette drop position ignores viewport transform

| Field                  | Value                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                           |
| **Area**               | ui · flow-canvas                                                                                                                                                                                     |
| **Status**             | fixed                                                                                                                                                                                                |
| **Symptom**            | Dropped node appears far from cursor (often ~500px offset) when canvas is panned/zoomed or after viewport fit.                                                                                       |
| **Repro**              | Pan/zoom canvas → drop node from palette → node lands in wrong flow coordinates.                                                                                                                     |
| **Root cause**         | `handleDrop` sent `clientX/Y - hostRect` (screen-local pixels) as workflow position. ng-diagram stores node positions in **flow space**; must use `NgDiagramViewportService.clientToFlowPosition()`. |
| **Fix**                | Convert drop point with `viewport.clientToFlowPosition({ x: event.clientX, y: event.clientY })` before `editor.addNode.requested`.                                                                   |
| **Design flaw signal** | **Coordinate space mismatch** — DOM/client coords ≠ diagram flow coords whenever viewport metadata is non-identity.                                                                                  |
| **Regression test**    | `packages/ui/src/app/features/canvas/flow-canvas.component.test.ts` — "emits editor.addNode.requested with flow coordinates from viewport"                                                           |
