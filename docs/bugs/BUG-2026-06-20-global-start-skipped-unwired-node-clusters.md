---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-20
flaw: Global run must execute every...
package: runtime
fixed: yes
---

### BUG-2026-06-20 — Global `start()` skipped unwired node clusters

| Field                  | Value                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-20                                                                                                                                                                       |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                               |
| **Status**             | fixed (superseded scope model)                                                                                                                                                   |
| **Symptom**            | Global run (`start()`) wired all edges at once but scope only included nodes incident to edges. Orphan singletons never executed.                                                |
| **Repro**              | Add constant A with no edges → `start()`. Or: run A→B→C, delete middle node B, `start()` with orphan A and C.                                                                    |
| **Root cause**         | Single full-graph scope derived from edges only; orphan nodes were not wired.                                                                                                    |
| **Fix**                | {@link Runtime.start} wires **all** nodes and edges in one scope ([ADR.md](../adr/042-runtime-editor-runner.md)). Orphans run but stay `running` until interrupt or finish node. |
| **Design flaw signal** | **Global run must execute every canvas node, not only edge-induced subgraph.**                                                                                                   |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts` (`orphan nodes run on global start…`)                                                                       |
