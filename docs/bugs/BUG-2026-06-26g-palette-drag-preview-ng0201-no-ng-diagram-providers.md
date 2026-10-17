---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: DI boundary for off-canvas co...
package: ui
fixed: yes
---

### BUG-2026-06-26g — palette drag preview NG0201 (no ng-diagram providers)

| Field                  | Value                                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                                                            |
| **Area**               | ui · palette · angular di                                                                                                                                                                                                                                             |
| **Status**             | fixed                                                                                                                                                                                                                                                                 |
| **Symptom**            | `NG0201` in browser console when starting palette drag after drag-image preview was wired to `LfNodeComponent`.                                                                                                                                                       |
| **Repro**              | Drag any node from palette sidebar → error before/at drop.                                                                                                                                                                                                            |
| **Root cause**         | `attachPaletteDragImage` uses `createComponent` with root `EnvironmentInjector`. `PaletteDragPreviewComponent` rendered `LfNodeComponent` → `LfNodePortRowComponent` → `NgDiagramPortComponent`, which requires `provideNgDiagram()` scoped to `FlowCanvasComponent`. |
| **Fix**                | Drag preview uses `LfNodePortRowStaticComponent` (CSS port dots, no ng-diagram) with the same `lf-node-chrome` layout and `resolveNodePorts` data.                                                                                                                    |
| **Design flaw signal** | **DI boundary for off-canvas components** — `createComponent` outside the diagram host cannot reuse diagram-internal leaf components without duplicating providers or a provider-free visual clone.                                                                   |
| **Regression test**    | `none` (runtime DI + drag API; manual palette drag smoke)                                                                                                                                                                                                             |
