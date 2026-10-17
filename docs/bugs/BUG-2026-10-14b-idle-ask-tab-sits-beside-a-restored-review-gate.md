---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-14
flaw: Idle start surface and in-loo...
package: ui
fixed: yes
---

### BUG-2026-10-14b — idle Ask tab sits beside a restored Review gate

| Field                  | Value                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-14                                                                                                                                                                                           |
| **Area**               | ui · composer                                                                                                                                                                                        |
| **Status**             | fixed                                                                                                                                                                                                |
| **Symptom**            | After leaving a session that is waiting on Review and coming back, the composer shows Review and Ask. Ask is the idle Chat Input prompt ("What should be improved?").                                |
| **Repro**              | Run starter → wait until Review → switch to another session → switch back.                                                                                                                           |
| **Root cause**         | Session select interrupts the parked run, so the runner is idle, and the restored feed still opens Review. `hitlTriggeredNodeIds` then appended every idle chat-entry node beside that awaiting set. |
| **Fix**                | Composer tabs are the awaiting set when it is non-empty. Idle chat-entry ids are the tabs only when nothing is awaiting.                                                                             |
| **Design flaw signal** | **Idle start surface and in-loop gates were one list.** Chat Input is the composer when the graph is idle. It is not a second gate beside a Review that the feed still has open.                     |
| **Regression test**    | `packages/ui/src/app/features/composer/tests/composer-awaiting-node-ids.test.ts`                                                                                                                     |
