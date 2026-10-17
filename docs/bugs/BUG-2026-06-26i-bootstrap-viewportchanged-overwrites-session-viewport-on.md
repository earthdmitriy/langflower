---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Init events ≠ user intent
package: ui
fixed: yes
---

### BUG-2026-06-26i — bootstrap viewportChanged overwrites session viewport on server

| Field                  | Value                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                        |
| **Area**               | ui · flow-canvas · viewport sync                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                             |
| **Symptom**            | After reconnect, server sends correct `session.state.snapshot.viewport`, then client emits `editor.viewport.requested` `{ x: 0, y: 0, scale: 1 }` and clobbers shared session viewport.           |
| **Repro**              | Pan/zoom canvas → reload → snapshot has saved viewport → ng-diagram init fires default `viewportChanged` → WS sends `{0,0,1}`.                                                                    |
| **Root cause**         | Outbound viewport sync was enabled before session viewport hydration finished; init `viewportChanged` was treated as user edit.                                                                   |
| **Fix**                | Bootstrap gate: ignore outbound sends until session viewport is applied (or confirmed absent). Skip default `{0,0,1}` during hydration; consume first post-`setViewport` echo without publishing. |
| **Design flaw signal** | **Init events ≠ user intent** — diagram lifecycle emits default viewport before server state is applied; domain intents must wait for hydrate-complete boundary.                                  |
| **Regression test**    | `packages/ui/src/app/features/canvas/canvas-viewport-sync.test.ts`; manual reconnect smoke                                                                                                        |
