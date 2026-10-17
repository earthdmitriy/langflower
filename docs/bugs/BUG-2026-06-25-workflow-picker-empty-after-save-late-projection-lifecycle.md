---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-25
flaw: Transport must start when the...
package: ui
fixed: yes
---

### BUG-2026-06-25 — Workflow picker empty after save (late projection lifecycle)

| Field                  | Value                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-25                                                                                                                                                                                                                                                 |
| **Area**               | ui · ws                                                                                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                                                                                      |
| **Symptom**            | Workflow file saved on disk but picker `<select>` stayed empty                                                                                                                                                                                             |
| **Repro**              | Lazy editor route loads after WebSocket bootstrap; save or open picker                                                                                                                                                                                     |
| **Root cause**         | WebSocket opened in `LangflowerBridgeService` constructor before editor shell and projections existed; cold `shareReplay` + late subscribers missed bootstrap; catalog merged `snapshot.workflows` instead of `workflow.list.requested`                    |
| **Fix**                | Lazy `connect()` in `EditorPageComponent.ngAfterViewInit`; `LangflowerBridgeService.from()` for server→client observables (wait for client); `workflow.list.requested` on `session.ready`; catalog from `workflow.list.snapshot` + `refresh()` after ready |
| **Design flaw signal** | Transport must start when the editor shell is ready, not at app bootstrap; projections bind via `from()`, intents via `raw` after `connect()`                                                                                                              |
| **Regression test**    | `tests/integration/ws/workflows.ws.test.ts`                                                                                                                                                                                                                |
