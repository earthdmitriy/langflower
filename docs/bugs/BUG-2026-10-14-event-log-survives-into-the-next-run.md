---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-14
flaw: The log's lifetime was "until...
package: runtime
fixed: yes
---

### BUG-2026-10-14 — event log survives into the next run

| Field                  | Value                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-14                                                                                                                                                                                         |
| **Area**               | execution                                                                                                                                                                                          |
| **Status**             | fixed                                                                                                                                                                                              |
| **Symptom**            | After two runs without Clear, a reconnect replays the first run's frames under the second run's id.                                                                                                |
| **Repro**              | Start the same graph twice on one runner with `log: true` and without `clearEventLog`. `runner.eventLog` contains a `done` frame for both run ids.                                                 |
| **Root cause**         | The retained log was cleared only by Clear and by a document switch. `start` appended into the same buffer, and port frames do not carry a run id, so the snapshot adopted the new run's id.       |
| **Fix**                | `RuntimeRunner.runScope` clears `eventLogBuffer` when the start is not a resume, before the run emits frames. Resume, and empty-graph `finishRun` paths that never enter `runScope`, do not clear. |
| **Design flaw signal** | The log's lifetime was "until Clear", while run identity lived only on the `done` frame and the server snapshot. The buffer outlived the run it recorded.                                          |
| **Regression test**    | `packages/runtime/src/runtime.test.ts` (`clears eventLog when a later run starts`)                                                                                                                 |
