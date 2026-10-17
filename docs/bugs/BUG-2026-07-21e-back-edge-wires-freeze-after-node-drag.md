---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-21
flaw: Custom edge templates must no...
package: ui
fixed: yes
---

### BUG-2026-07-21e — Back-edge wires freeze after node drag

| Field                  | Value                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-21                                                                                                                                                                                                                                            |
| **Area**               | canvas · ui                                                                                                                                                                                                                                           |
| **Status**             | fixed                                                                                                                                                                                                                                                 |
| **Symptom**            | After dragging a node, wires (esp. feedback / below-routed back-edges) detach from ports or keep stale U-paths; reload fixes them.                                                                                                                    |
| **Repro**              | Wire a leftward loop (e.g. Review Gate.feedback → FakeLLM); drag either node; stubs stay at old coordinates until tab reload.                                                                                                                         |
| **Root cause**         | `LfEdgeChrome` passed `routingMode: 'manual'` + `points` into `ng-diagram-base-edge`. Base-edge `syncEdgePropertiesToModel` writes those into the model; auto re-route on drag is skipped, so `sourcePosition`/`targetPosition` and waypoints freeze. |
| **Fix**                | Below-route via `createBackEdgeAwareOrthogonalRouting` (replaces built-in `orthogonal` on `diagramInit`, stays auto). Chrome only dashes when bounds are missing. Clear any stuck `routingMode: 'manual'` on init.                                    |
| **Design flaw signal** | **Custom edge templates must not push `routingMode: 'manual'` into the bound edge** — ng-diagram treats that as model state, not a render override. Prefer `registerRouting` / auto `computePoints` for dynamic geometry.                             |
| **Regression test**    | `packages/ui/src/app/features/canvas/tests/compute-back-edge-aware-points.test.ts`; `lf-edge-chrome.test.ts` (isBack re-eval after position change)                                                                                                   |
