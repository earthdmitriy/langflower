---
kind: bug
owner: docs
covers: []
status: current
date: 2026-07-17
flaw: Settled run ≠ mid-flight stat...
package: ui
fixed: yes
---

### BUG-2026-07-17c — parallel HITL tab lingered after `runner.done`

| Field                  | Value                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-07-17                                                                                                                                                                                                   |
| **Area**               | ui · hitl                                                                                                                                                                                                    |
| **Status**             | fixed                                                                                                                                                                                                        |
| **Symptom**            | Two Review Gates awaited; approving one finished the run (`runner.done`); the second composer tab stayed visible with no live runner behind it.                                                              |
| **Repro**              | Parallel HITL gates → reply on one branch that reaches finish → observe leftover tab for the unanswered gate.                                                                                                |
| **Root cause**         | HITL awaiting fold hard-reset only on `interrupted` / new `runId`, deliberately skipping `runner.done` (to avoid nuclear wipes via `!isRunning` hydrate). After a true settle, orphan tabs are dead UI.      |
| **Fix**                | Hard-reset awaiting on `runner.done` as well as interrupt / new `runId`. Keep hydrate ungated on `!isRunning`.                                                                                               |
| **Design flaw signal** | **Settled run ≠ mid-flight status flip.** Protecting parallel siblings from hydrate/`isRunning` gates is right; leaving composer open after `runner.done` is not — `done` is an explicit end-of-run fact.    |
| **Regression test**    | Hard-reset on `runner.done` lives in `features/composer/execution-hitl-fold.ts`. Nearest tests: `features/canvas-node-status-folding/tests/canvas-node-hitl-projection.test.ts`. No remaining WES test file. |
