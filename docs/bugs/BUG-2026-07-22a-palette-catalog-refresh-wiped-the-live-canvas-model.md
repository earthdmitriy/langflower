---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-22
flaw: Treating a catalog/metadata s...
package: ui
fixed: yes
---

### BUG-2026-07-22a — Palette catalog refresh wiped the live canvas model

| Field                  | Value                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-22                                                                                                                                                                                    |
| **Area**               | canvas · ui                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                         |
| **Symptom**            | Refreshing the node palette (new `palette.snapshot` reference) could reset the ng-diagram model — selection, live edits, and viewport hydrate could behave as if the graph was reloaded.      |
| **Repro**              | Open a workflow with nodes → trigger palette reload (catalog refresh) without changing the workflow graph → observe `modelAdapter` / `initializeModel` re-run.                                |
| **Root cause**         | `FlowCanvasComponent.modelAdapter` computed tracked both `graphInput()` and `palette()`, so any new palette input identity re-called `initializeModel`.                                       |
| **Fix**                | Track only `graphInput()` in `modelAdapter` (`untracked` palette for seed); subsequent palette inputs patch live `portsConfig` via `updateNodes`. Hydrate gate resets on graph identity only. |
| **Design flaw signal** | Treating a catalog/metadata stream as a full model seed dependency; seed vs live-patch ownership must be split when inputs share a host.                                                      |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/flow-canvas.component.test.ts` — `keeps modelAdapter identity when only palette changes`                                                           |
