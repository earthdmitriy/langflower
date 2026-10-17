---
kind: bug
owner: docs
covers: []
status: current
date: 2026-10-15
flaw: The lock matched the id, the...
package: server
fixed: yes
---

### BUG-2026-10-15b — overlapping session creates share one tab file

| Field                  | Value                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-10-15                                                                                                                                                                          |
| **Area**               | server · sessions                                                                                                                                                                   |
| **Status**             | fixed                                                                                                                                                                               |
| **Symptom**            | Two New clicks, or New and Run together, can leave a single tab. The second write replaces the first session file.                                                                  |
| **Repro**              | Fire `createWorkflowSession` twice without waiting. Both read the same next ordinal and `copyFile` the same `YYYY-MM-DD #N.json`.                                                   |
| **Root cause**         | The write chain is keyed by `sessionId`. New sessions have different ids, and the filename is the label. `nextOrdinal` and `write` were not one critical section.                   |
| **Fix**                | `WorkflowSessionStore.exclusiveDirectory` holds the workflow directory across ordinal allocation and the first write. `ensureSessionForRun` re-checks the binding inside that lock. |
| **Design flaw signal** | **The lock matched the id, the path matched the label.** A chain per record does not serialize two creates that have not picked a record yet.                                       |
| **Regression test**    | `packages/server/src/workflow-sessions/workflow-session-actions.test.ts` (`assigns distinct labels when two creates overlap`, `binds one session when two runs ensure together`)    |
