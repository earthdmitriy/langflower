---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-17
flaw: Feed-clear is not a mid-run o...
package: ui
fixed: yes
---

### BUG-2026-07-17 — Clear during an active run wiped feed chrome / looked like Stop

| Field                  | Value                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-17                                                                                                                                                                                                                   |
| **Area**               | server · ui · hitl                                                                                                                                                                                                           |
| **Status**             | fixed                                                                                                                                                                                                                        |
| **Symptom**            | Pressing Clear during an active run wiped the work log **and** canvas node/wire highlights; earlier also made the UI treat the run as stopped when `runId` was nulled.                                                       |
| **Repro**              | Start a workflow (or HITL), wait for canvas chrome / Review Gate, click Clear in the work-log header.                                                                                                                        |
| **Root cause**         | Clear shared `executionFeed.snapshot` with the chrome folds — an empty (or null) snapshot replayed as a full chrome reset. Nulling `runId` mid-run also collapsed the UI run-gate.                                           |
| **Fix**                | Clear is forbidden while `runnerStatus === 'running'`: UI hides the button (`!isRunning()`); server ignores `executionFeed.clear.requested`. Idle clear still wipes the log and drops `runId`.                               |
| **Design flaw signal** | **Feed-clear is not a mid-run operation.** The same snapshot channel feeds timeline and canvas chrome; clearing history during a live run has no safe shared meaning — gate the intent instead of special-casing every fold. |
| **Regression test**    | `packages/server/src/session/clear-feed-while-running.test.ts`                                                                                                                                                               |
