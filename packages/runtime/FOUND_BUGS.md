# Runtime v2 — found bugs log

Append-only record of **reproduced bugs** in {@link Runtime} (v2 prototype).
Parent log: [`docs/FOUND_BUGS.md`](../../../../docs/FOUND_BUGS.md).

Spec: [`spec.md`](./spec.md) · Lifecycle tests: [`testing/lyfecycle/lyfecycle.lifecycle.test.ts`](./testing/lyfecycle/lyfecycle.lifecycle.test.ts)

---

## Entry template

```markdown
### BUG-YYYY-MM-DD — short title

| Field                  | Value                      |
| ---------------------- | -------------------------- |
| **Date**               | YYYY-MM-DD                 |
| **Area**               | runtime-v2 · lifecycle · … |
| **Status**             | fixed · open · wontfix     |
| **Symptom**            | …                          |
| **Repro**              | …                          |
| **Root cause**         | …                          |
| **Fix**                | …                          |
| **Design flaw signal** | …                          |
| **Regression test**    | …                          |
```

---

## Log

Newest first.

### BUG-2026-06-20 — Second run after graph edit never emits `done`

| Field                  | Value                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Date**               | 2026-06-20                                                                                                                                                                                                                                                         |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                                                                                                                 |
| **Status**             | wontfix                                                                                                                                                                                                                                                            |
| **Symptom**            | After an acyclic run completes (`done` → `idle`), user adds a node and edge (e.g. extend A→B to A→B→C). Second `start()` stays `running`; `done` never fires; terminal output on the new node is not reachable via `readOutputValue` within a short settle window. |
| **Repro**              | 1. Wire constant A → delay B, `start()`, await acyclic auto-`done`. 2. `addNode` delay C, `addEdge` B→C. 3. `start()` again; subscribe to `done` or call `readOutputValue` on C — hangs / times out.                                                               |
| **Root cause**         | Auto-done awaited stale `firstValueFrom(output.value$)` on terminal ports after graph mutation between runs.                                                                                                                                                       |
| **Fix**                | **Superseded by [ADR.md](./ADR.md)** — removed acyclic auto-done; use `stopsRun` finish node or `interrupt`. Second run with finish node: `lyfecycle.lifecycle.test.ts` (`second run after graph edit completes via finish node`).                                 |
| **Design flaw signal** | **Implicit completion from graph shape** conflicted with hot observables across runs.                                                                                                                                                                              |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts`                                                                                                                                                                                               |

### BUG-2026-06-20 — `start()` from `stopped` does not complete acyclic runs

| Field                  | Value                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-20                                                                                                                                                                 |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                                         |
| **Status**             | wontfix                                                                                                                                                                    |
| **Symptom**            | After `interrupt('cancel')` (`status$` → `stopped`), user builds a wired acyclic graph and calls `start()`. Status becomes `running`, but acyclic auto-`done` never fired. |
| **Repro**              | 1. Empty `Runtime`, `start()`, `interrupt('cancel')`. 2. Add constant A → delay B + edge. 3. `start()` from `stopped`; await auto-`done` — timeout.                        |
| **Root cause**         | Same auto-done machinery as above; `stopped` → `start` is valid but auto-done was unreliable.                                                                              |
| **Fix**                | **Superseded by [ADR.md](./ADR.md)** — acyclic graphs stay `running` until `interrupt` or finish node; `stopped` → `start` works without special done detection.           |
| **Design flaw signal** | **`stopped` and `idle` treated equivalently for edits but not for runner re-entry under auto-done.**                                                                       |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts` (`starts a fresh run from stopped…`)                                                                  |

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

### BUG-2026-06-20 — Global `start()` skipped unwired node clusters

| Field                  | Value                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-20                                                                                                                                            |
| **Area**               | runtime-v2 · lifecycle · execution                                                                                                                    |
| **Status**             | fixed (superseded scope model)                                                                                                                        |
| **Symptom**            | Global run (`start()`) wired all edges at once but scope only included nodes incident to edges. Orphan singletons never executed.                     |
| **Repro**              | Add constant A with no edges → `start()`. Or: run A→B→C, delete middle node B, `start()` with orphan A and C.                                         |
| **Root cause**         | Single full-graph scope derived from edges only; orphan nodes were not wired.                                                                         |
| **Fix**                | {@link Runtime.start} wires **all** nodes and edges in one scope ([ADR.md](./ADR.md)). Orphans run but stay `running` until interrupt or finish node. |
| **Design flaw signal** | **Global run must execute every canvas node, not only edge-induced subgraph.**                                                                        |
| **Regression test**    | `packages/runtime/src/testing/lyfecycle/lyfecycle.lifecycle.test.ts` (`orphan nodes run on global start…`)                                            |

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
