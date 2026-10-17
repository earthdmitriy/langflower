---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-14
flaw: Process stop is not "sockets...
package: server
fixed: yes
---

### BUG-2026-10-14c — session file reads corrupt when the server stops mid-flush

| Field                  | Value                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-14                                                                                                                                                                                        |
| **Area**               | server · sessions                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                             |
| **Symptom**            | Resume after a process restart fails with `Session JSON is not parseable`. The integration point-resume test times out on that failure.                                                           |
| **Repro**              | Run until a point, interrupt, stop the server, start it again, resume by point id. `server.close` returns while detach is still copying the session file.                                         |
| **Root cause**         | Session replace uses `copyFile` over the live `.json`. `read` did not wait on the per-file write chain, so it parsed a half-copied file. `server.close` also returned before that flush finished. |
| **Fix**                | `read` retries a JSON parse failure (`copyFile` mid-replace). An `update` mutator can still read without joining that chain. `server.close(callback)` waits until detach finishes the flush.      |
| **Design flaw signal** | **Process stop is not "sockets closed".** Session durability is an async flush. Callers that treat `close`'s callback as "the files are stable" were reading a copy in progress.                  |
| **Regression test**    | Existing `tests/integration/ws/workflow-sessions.ws.test.ts` (`appends a point on the bound session and resumes by pointId`) fails when close returns early.                                      |
