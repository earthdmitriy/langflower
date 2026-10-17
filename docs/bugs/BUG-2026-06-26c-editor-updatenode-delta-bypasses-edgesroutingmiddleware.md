---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Two-path model update
package: ui
fixed: yes
---

### BUG-2026-06-26c — editor.updateNode.delta bypasses edgesRoutingMiddleware

| Field                  | Value                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                                                                                                        |
| **Area**               | ui · bridge-diagram                                                                                                                                                                                                                                                                                                                               |
| **Status**             | fixed                                                                                                                                                                                                                                                                                                                                             |
| **Symptom**            | Edges freeze at stale SVG paths after node drag — second drag makes edge visually disconnect from node because edge routing middleware never runs.                                                                                                                                                                                                |
| **Repro**              | Connect two nodes with an edge → drag source node → edge updates (via internal moveNodesBy) → server confirms with updateNode.delta → drag source node again → edge SVG path doesn't update, appears disconnected.                                                                                                                                |
| **Root cause**         | `editor.updateNode.delta` handler used `adapter.updateNodes()` and/or full `persistedNodeToDiagram()` rebuilds, bypassing or perturbing the middleware pipeline. Full node payloads re-triggered port bulk middleware (`deletePortsBulk` / `updatePortsBulk`), invalidating `measuredPorts` so the second `updateNodes` could not re-route edges. |
| **Fix**                | Route delta patches through `NgDiagramModelService.updateNodes()`. Compare delta node with prior state (`activeWorkflow` or on-canvas node): position-only → partial `{ id, position, size? }`; params/inputs/label/port-slot changes → include `data`/`type`/`autoSize` from `persistedNodeToDiagram`. Removed private `flowCore` hack.          |
| **Design flaw signal** | **Two-path model update** — `SignalModelAdapter` (data layer) and `FlowCore` (command/middleware layer) are separate. Direct adapter writes skip middleware. Server-pushed updates must use model service APIs; avoid full diagram node rebuilds when only geometry changed.                                                                      |
| **Regression test**    | `packages/ui/src/app/features/canvas/flow-canvas.component.test.ts` — "connected edge updates after second node drag"                                                                                                                                                                                                                             |
