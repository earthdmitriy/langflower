---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Status vs graph transport
package: ui
fixed: yes
---

### BUG-2026-06-26j — Save stays disabled after editor mutations (no dirty broadcast)

| Field                  | Value                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                             |
| **Area**               | server · bridge · ui · workflow topbar                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                  |
| **Symptom**            | Save button inactive after add/move/connect nodes — `currentStatus` stays `pristine` in UI.                                                                                            |
| **Repro**              | Load workflow → add node or move node → Save disabled.                                                                                                                                 |
| **Root cause**         | Editor delta rollout removed `workflow.current.snapshot` broadcasts from editor handlers (to avoid canvas resnapshot). Server called `markDirty()` but never pushed status to clients. |
| **Fix**                | New `workflow.currentStatus.snapshot` broadcast after non-empty `editor.*.delta`; topbar applies status slice without touching canvas.                                                 |
| **Design flaw signal** | **Status vs graph transport** — dirty flag is workflow-manager state, not canvas topology; must not require full `workflow.current.snapshot` (which would re-merge the graph).         |
| **Regression test**    | `tests/integration/ws/editor.ws.test.ts` — add node emits `{ status: 'dirty' }`                                                                                                        |
