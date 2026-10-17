---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-20
flaw: `stopped` and `idle` treated...
package: runtime
fixed: yes
---

### BUG-2026-06-20 — `start()` from `stopped` does not complete acyclic runs

| Field                  | Value                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-20                                                                                                                                                                                  |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                                          |
| **Status**             | wontfix                                                                                                                                                                                     |
| **Symptom**            | After `interrupt('cancel')` (`status$` → `stopped`), user builds a wired acyclic graph and calls `start()`. Status becomes `running`, but acyclic auto-`done` never fired.                  |
| **Repro**              | 1. Empty `Runtime`, `start()`, `interrupt('cancel')`. 2. Add constant A → delay B + edge. 3. `start()` from `stopped`; await auto-`done` — timeout.                                         |
| **Root cause**         | Same auto-done machinery as above; `stopped` → `start` is valid but auto-done was unreliable.                                                                                               |
| **Fix**                | **Superseded by [ADR.md](../adr/042-runtime-editor-runner.md)** — acyclic graphs stay `running` until `interrupt` or finish node; `stopped` → `start` works without special done detection. |
| **Design flaw signal** | **`stopped` and `idle` treated equivalently for edits but not for runner re-entry under auto-done.**                                                                                        |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts` (`starts a fresh run from stopped…`)                                                                                   |
