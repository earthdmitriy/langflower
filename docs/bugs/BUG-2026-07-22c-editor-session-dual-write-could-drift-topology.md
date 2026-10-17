---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-22
flaw: Two live sources of truth for...
package: server
fixed: yes
---

### BUG-2026-07-22c — Editor ↔ session dual-write could drift topology

| Field                  | Value                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-07-22                                                                                                                                                                                   |
| **Area**               | server · workflow · editor                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                                        |
| **Symptom**            | Missed dual-write after an editor mutation could leave `session.activeWorkflow` node/edge ids out of sync with `RuntimeEditor` — save ≠ run / multi-tab desync.                              |
| **Repro**              | Code audit (`docs/_archive/code-regression/server-core.md` finding #4); unit path in `apply-editor-mutation.test.ts` (topology single-writer).                                               |
| **Root cause**         | Separate helpers updated editor and session document independently (`upsertActiveWorkflowNode`, edge append/remove/replace).                                                                 |
| **Fix**                | Single-writer: mutate `RuntimeEditor`, then `syncActiveWorkflowTopologyFromEditor` rebuilds session topology from editor (payloads keyed by id). Load path still document → editor via bind. |
| **Design flaw signal** | Two live sources of truth for the same graph without a mandatory sync step — parallel updates can silently diverge.                                                                          |
| **Regression test**    | `packages/server/src/workflow/apply-editor-mutation.test.ts` — `editor ↔ session topology single-writer`                                                                                     |
