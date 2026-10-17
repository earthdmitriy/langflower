---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-25
flaw: Optimistic UI sync treated as...
package: ui
fixed: yes
---

### BUG-2026-06-25 — Dropped node vanishes (duplicate editor.addNode)

| Field                  | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-25                                                                                                                                                                            |
| **Area**               | ui · ws · canvas                                                                                                                                                                      |
| **Status**             | fixed                                                                                                                                                                                 |
| **Symptom**            | Drop palette node → brief flash → node removed; WS shows second `editor.addNode.settled: false` then `editor.removeNode`                                                              |
| **Repro**              | Drop any node on canvas; ngDiagram `onChange` fires twice before first add settles                                                                                                    |
| **Root cause**         | `EditorSyncService` marked nodes synced only after async `settled`; duplicate `handleModelChange` enqueued a second `addNode` with the same id → runtime rejected → `revertAddedNode` |
| **Fix**                | Track `pendingNodeIds` / `pendingEdgeIds` synchronously on enqueue; abort server add if canvas node gone before settled                                                               |
| **Design flaw signal** | Optimistic UI sync treated async acknowledgment as the only in-flight guard; diagram emits multiple change events per gesture                                                         |
| **Regression test**    | none — UI service; manual WS trace                                                                                                                                                    |
