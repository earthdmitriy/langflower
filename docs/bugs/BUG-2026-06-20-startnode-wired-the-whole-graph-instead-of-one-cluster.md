---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-20
flaw: `startNode` scope = cluster c...
package: runtime
fixed: yes
---

### BUG-2026-06-20 — `startNode()` wired the whole graph instead of one cluster

| Field                  | Value                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-20                                                                                                                                                                                                                                                |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                                                                                                        |
| **Status**             | fixed                                                                                                                                                                                                                                                     |
| **Symptom**            | Run-from-node used {@link collectUpstreamEdgeIds} (upstream-only) while still watching telemetry on **all** graph nodes. Orphan nodes outside the target subgraph were not ignored consistently; scope semantics did not match “run this node's cluster”. |
| **Repro**              | Graph A→B→C plus orphan O. `startNode('B')` — expected only {A,B,C} cluster; O should not execute.                                                                                                                                                        |
| **Root cause**         | `wireScope` watched every node in the editor; edge scope used upstream closure instead of weakly connected cluster containing `nodeId`.                                                                                                                   |
| **Fix**                | {@link Runtime.startNode} resolves {@link resolveClusterForNode} and calls {@link Runtime.runCluster} with that cluster's `nodeIds` / `edgeIds` only — orphan nodes on the canvas are not wired or watched.                                               |
| **Design flaw signal** | **`startNode` scope = cluster containing anchor, not upstream slice** — editor run-selection must not disturb unrelated orphan clusters.                                                                                                                  |
| **Regression test**    | `packages/runtime/src/runtime.test.ts` (`startNode runs the cluster containing the node and ignores other clusters`)                                                                                                                                      |
