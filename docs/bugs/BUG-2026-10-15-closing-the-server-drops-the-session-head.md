---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-15
flaw: Process stop waited on the gr...
package: server
fixed: yes
---

### BUG-2026-10-15 — closing the server drops the session head

| Field                  | Value                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-15                                                                                                                                                                                         |
| **Area**               | server · sessions                                                                                                                                                                                  |
| **Status**             | fixed                                                                                                                                                                                              |
| **Symptom**            | Stop Langflower within a second of the last agent turn. The next start restores the previous transcript, not the turn that just finished. A point that was still copying can be read half-written. |
| **Repro**              | Bound session, non-streaming port frame (schedules the 1s head flush), then `server.close` before the timer. Detach returns without writing `nodeStates` or the closed feed frames.                |
| **Root cause**         | Detach called `headFlush.cancel()` and only `autosave.flush()` (the graph). Point appends are `void` promises and were not joined.                                                                 |
| **Fix**                | Detach unsubscribes, then `await headFlush.flushNow()`, then awaits the in-flight point writes, then flushes autosave.                                                                             |
| **Design flaw signal** | **Process stop waited on the graph debounce and dropped the conversation debounce.** Durability of the head is the same flush as the graph, and close has to join both.                            |
| **Regression test**    | `none` — the write is `flushWorkflowSessionHead` (`workflow-session-run.test.ts`); detach now calls `flushNow` instead of `cancel`.                                                                |
