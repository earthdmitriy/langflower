---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-20
flaw: Lifecycle echo treated as mut...
package: ui
fixed: yes
---

### BUG-2026-07-20 — canvas viewport hydrate marks workflow dirty (Save active on load)

| Field                  | Value                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-20                                                                                                                                                                                                                                    |
| **Area**               | ui · flow-canvas · server · workflow topbar                                                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                                                                         |
| **Symptom**            | Save becomes enabled shortly after loading a pristine workflow, before any user edit.                                                                                                                                                         |
| **Repro**              | Load a saved workflow with non-zero pan → wait ~300ms → Save active / `currentStatus` is `dirty`.                                                                                                                                             |
| **Root cause**         | After mount, ng-diagram re-emits the hydrated viewport; client sent `editor.viewport.requested` (weak `Boolean(v.x && v.y)` gate). Server always wrote viewport + `markDirty()`. Related to BUG-2026-06-26i (hydrate gate never fully wired). |
| **Fix**                | Client: `gateCanvasViewportPublish` + `distinctUntilChanged` before publish. Server: skip write/`markDirty` when payload matches current viewport (epsilon).                                                                                  |
| **Design flaw signal** | **Lifecycle echo treated as mutation** — diagram/service re-emits restored state; domain dirty must require a real change, not a no-op round-trip.                                                                                            |
| **Regression test**    | `packages/ui/.../canvas-viewport-sync.test.ts` (`gateCanvasViewportPublish`); `tests/integration/ws/editor.ws.test.ts` — same viewport echo stays pristine                                                                                    |
