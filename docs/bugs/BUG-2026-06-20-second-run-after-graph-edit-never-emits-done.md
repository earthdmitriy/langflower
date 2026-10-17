---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-20
flaw: Implicit completion from grap...
package: runtime
fixed: yes
---

### BUG-2026-06-20 — Second run after graph edit never emits `done`

| Field                  | Value                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-20                                                                                                                                                                                                                                                         |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                                                                                                                 |
| **Status**             | wontfix                                                                                                                                                                                                                                                            |
| **Symptom**            | After an acyclic run completes (`done` → `idle`), user adds a node and edge (e.g. extend A→B to A→B→C). Second `start()` stays `running`; `done` never fires; terminal output on the new node is not reachable via `readOutputValue` within a short settle window. |
| **Repro**              | 1. Wire constant A → delay B, `start()`, await acyclic auto-`done`. 2. `addNode` delay C, `addEdge` B→C. 3. `start()` again; subscribe to `done` or call `readOutputValue` on C — hangs / times out.                                                               |
| **Root cause**         | Auto-done awaited stale `firstValueFrom(output.value$)` on terminal ports after graph mutation between runs.                                                                                                                                                       |
| **Fix**                | **Superseded by [ADR.md](../adr/042-runtime-editor-runner.md)** — removed acyclic auto-done; use `stopsRun` finish node or `interrupt`. Second run with finish node: `lyfecycle.lifecycle.test.ts` (`second run after graph edit completes via finish node`).      |
| **Design flaw signal** | **Implicit completion from graph shape** conflicted with hot observables across runs.                                                                                                                                                                              |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts`                                                                                                                                                                                               |
