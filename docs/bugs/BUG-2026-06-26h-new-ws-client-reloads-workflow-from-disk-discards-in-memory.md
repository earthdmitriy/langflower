---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-26
flaw: Session scope vs transport scope
package: server
fixed: yes
---

### BUG-2026-06-26h — new WS client reloads workflow from disk, discards in-memory graph

| Field                  | Value                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-26                                                                                                                                                                                                                   |
| **Area**               | server · bridge · session                                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                                                        |
| **Symptom**            | Second browser tab or page reload shows canvas layout from persisted workflow file, not the live in-memory graph (unsaved moves/adds lost on connect).                                                                       |
| **Repro**              | Tab A: load workflow, move a node (don't save). Tab B connect or reload browser → node at old on-disk position.                                                                                                              |
| **Root cause**         | Each WS client got its own `LangflowerSession`; `emitBootstrap` always called `loadWorkflowIntoSession` from disk; disconnect disposed the runtime.                                                                          |
| **Fix**                | One shared `LangflowerSession` per bridge/server process. Bootstrap loads from disk only when `activeWorkflow === null`; reconnect sends `session.state.snapshot` from memory. Client disconnect no longer disposes session. |
| **Design flaw signal** | **Session scope vs transport scope** — domain state (runtime + active workflow) must outlive a single WebSocket connection; bootstrap is hydrate-or-replay, not always cold-load.                                            |
| **Regression test**    | `tests/integration/ws/ws-session-sync.ws.test.ts` — second client + reconnect snapshots                                                                                                                                      |
