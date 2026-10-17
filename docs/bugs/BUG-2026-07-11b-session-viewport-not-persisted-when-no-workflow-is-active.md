---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-11
flaw: State ownership mismatch
package: server
fixed: deferred
---

### BUG-2026-07-11b — session viewport not persisted when no workflow is active

| Field                  | Value                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-11                                                                                                                                                                                                                                                                                                                                    |
| **Area**               | server · ws · session                                                                                                                                                                                                                                                                                                                         |
| **Status**             | open (deferred — unrelated to RuntimeEdge/node-data refactor in progress)                                                                                                                                                                                                                                                                     |
| **Symptom**            | `tests/integration/ws/ws-session-sync.ws.test.ts` — "broadcasts editor.viewport.delta and restores viewport on reconnect" fails: third client's `session.state.snapshot.viewport` is `undefined` instead of the viewport emitted by client A.                                                                                                 |
| **Repro**              | Connect client A (no `workflow.load`), emit `editor.viewport.requested`; connect client C and read its `session.state.snapshot`. Reproduces in isolation (`npx vitest run --project integration ... ws-session-sync.ws.test.ts`), not order-dependent.                                                                                        |
| **Root cause**         | `attach-langflower-bridge.ts`'s `editor.viewport.requested` handler only writes `raw.payload` into `session.activeWorkflow.graph.viewport` when `session.activeWorkflow !== null`; it never persists viewport at the session level, so a client that never loaded a workflow has no way to broadcast durable viewport state to later joiners. |
| **Fix**                | Deferred — needs a session-level (not per-workflow) viewport field, or the test needs a `workflow.load` before asserting reconnect-restore. Not touched by this change; no edge/port files were modified for this path.                                                                                                                       |
| **Design flaw signal** | **State ownership mismatch** — viewport is UI/session-scoped but was only ever wired into workflow-scoped graph state, so it silently no-ops outside an active workflow.                                                                                                                                                                      |
| **Regression test**    | `tests/integration/ws/ws-session-sync.ws.test.ts` (already exists, currently red — not authored in this change)                                                                                                                                                                                                                               |
