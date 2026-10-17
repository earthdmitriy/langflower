---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-20
flaw: “Run empty canvas” had no def...
package: runtime
fixed: yes
---

### BUG-2026-06-20 — Empty graph `start()` never emits `done`

| Field                  | Value                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-20                                                                                                                                                                                                               |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                                                                       |
| **Status**             | fixed                                                                                                                                                                                                                    |
| **Symptom**            | User clicks Run on an **empty workflow** (zero nodes, zero edges). `start()` succeeded, `status$` → `running`, but **`done` never fired** — run stayed active until `interrupt`. Editor was locked for the whole period. |
| **Repro**              | `new Runtime()` → `start()` with no nodes. Observe `status$ === 'running'` and no `done` within 50ms.                                                                                                                    |
| **Root cause**         | {@link Runtime.scheduleDoneCheck} returned immediately when `doneOutputKeys.length === 0`. With no nodes/edges there was no terminal output to await and no completion signal.                                           |
| **Fix**                | {@link Runtime.start} — when `nodes.size === 0`, call {@link Runtime.finishRun} immediately after `running`.                                                                                                             |
| **Design flaw signal** | **“Run empty canvas” had no defined completion** — vacuous run should emit `done` → `idle` so the editor unlocks without `interrupt`.                                                                                    |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts` (`start on empty graph emits done and returns to idle`)                                                                                             |
