---
kind: bug
owner: docs
covers: []
status: current
date: 2026-09-19
flaw: Optimistic lock without owner.
package: server
fixed: yes
---

### BUG-2026-09-19 — Overlapping start rolls back the live run

| Field                  | Value                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-09-19                                                                                                                                                                                           |
| **Area**               | server · runner · ws                                                                                                                                                                                 |
| **Status**             | fixed                                                                                                                                                                                                |
| **Symptom**            | A second `runner.start` / `startNode` / idle HITL cold-start while another start is still seeding can idle the live run, drop its checkpoint, and dispose its MCP.                                   |
| **Repro**              | Two overlapping idle starts (or HITL + start) before `seedLiveContext` resolves. Loser `start()` returns `false`; the shared fail path sets `runnerStatus = 'idle'` and `checkpoints.clearActive()`. |
| **Root cause**         | `beginSeededRun` set `running` then `await`ed without an exclusive token. Resume already had `BUSY`; start did not. Rollback did not check whether _this_ attempt owned the run.                     |
| **Fix**                | `startHeld` token around seed + start/resume. Second attempt returns `false` / unicast resume `BUSY` before `seedLiveContext`. Rollback only when this attempt never announced a `RunId`.            |
| **Design flaw signal** | **Optimistic lock without owner.** Setting a shared `running` flag then awaiting is not exclusive if failure cleanup is global. Hold a token across the first `await` and roll back only the owner.  |
| **Regression test**    | Resume already covers `BUSY`. Start lock is the same token; overlapping start is a composition of that gate.                                                                                         |
