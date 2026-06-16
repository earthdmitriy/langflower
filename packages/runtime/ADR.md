# ADR: Runtime editor/runner split

| Field      | Value                          |
| ---------- | ------------------------------ |
| **Status** | accepted                       |
| **Date**   | 2026-06-20, amended 2026-06-23 |
| **Scope**  | `packages/runtime/src`         |

## Evolution — previous runtime versions

Project docs describe **three production execution generations** in
[`EXECUTION_ARCHITECTURE.md`](../../../../docs/EXECUTION_ARCHITECTURE.md),
[`DONE/EPICS/README.md`](../../../../docs/DONE/EPICS/README.md),
[`REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md), and
[`docs/TODO/runtime-refactor.md`](../../../../docs/TODO/runtime-refactor.md).
This package’s **current production** surface is the editor/runner split
(`RuntimeFacade`). Older gen-1…3 stacks are historical.

```text
Production (server path today)
  Gen 1  batch topo loop only          Phase 2–3
  Gen 2  batch loop + ReactivePortBus  Phase 4–6
  Gen 3  @langflower/runtime           cutover 2026-06-18  ← current

Current production (this package — editor/runner split)
  RuntimeFacade = RuntimeEditor + RuntimeRunner     this ADR (server path)
```

---

### Production gen 1 — batch topo executor (Phase 2–3)

**What it was** (historical Phase 2 «Resilient batch executor», Phase 3 Delay;
see [`EXECUTION_ARCHITECTURE.md`](../../../../docs/EXECUTION_ARCHITECTURE.md))

- Server-side **topological batch loop** over `defineNode` handlers only.
- One shot per node: resolve inputs → `execute()` (sync / Promise) → collect
  outputs → schedule downstream batch nodes.
- Resilient executor: per-node try/catch, `completed_with_errors`, optional
  `retry`, downstream skip on failed upstream.
- No hot port bus, no reactive nodes, no `defineReactiveNode`.

**What was wrong**

| Problem                       | Symptom / design flaw                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| **Batch-only mental model**   | Streaming, fan-out, and router passthrough needed a second execution path.      |
| **No shared hot outputs**     | Downstream wiring re-read node results from run cache, not a live port surface. |
| **Poor fit for Agent/Review** | LLM loops and feedback edges cannot be expressed as finite topo passes alone.   |

---

### Production gen 2 — batch loop + `ReactivePortBus` (Phase 4–6)

**What it was** (historical Phase 4–6;
[`REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md) «Old (shared bus path)»)

- **Two execution stacks** in `@langflower/server` + `@langflower/shared`:
    - Batch topo loop (`runGlobalBatchLoop`, `runPartialBatchLoop`, …).
    - Reactive sidecar: `ReactivePortBus`, `wireReactiveNodes`,
      `reactive-node-runtime.ts`, `NodeActivityTracker`.
- Batch nodes published outputs to the bus on complete;
  `dispatchPortEmit` / `fanOutBatchDownstream` fanned values to downstream.
- Reactive nodes (Router, Triple, later Agent/Review): input Observables from
  bus `observe()`; run idle via `NodeActivityTracker.waitForIdle()`.
- Run completion tied to **activity settle** and, in tests, output Observable
  `complete` — conflicting rules for hot `Subject` inputs.

**What was wrong** ([`FOUND_BUGS.md`](../../../../docs/FOUND_BUGS.md) 2026-06-18,
[`runtime-refactor.md`](../../../../docs/TODO/runtime-refactor.md) P0)

| Problem                              | Symptom / design flaw                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two adapters, two lifecycles**     | Batch scheduling vs bus emit; reactive targets could be scheduled as batch nodes (Review → Agent feedback).                                                                                                               |
| **`switchMap` + hot bus inputs**     | `combineLatest` on bus ports never `complete` → inner runs never settle → `waitForIdle` timeout on Review loop.                                                                                                           |
| **Output `complete` ≈ run complete** | Session `onOutputComplete` / port `complete` assumed terminal Observable completion that hot inputs never emit.                                                                                                           |
| **Idle heuristics for HITL**         | Interactive Ask User loops auto-`completed` after N replies when graph looked idle ([ADR-015](../../../../docs/ADR.md#adr-015--interactive-hitl-feedback-loops-end-on-stop-not-idle-settle) documents the fix direction). |
| **Duplication**                      | Terminal-port predicates, activity tracking, HITL wiring duplicated between session and shared runtime ([`TO_REVIEW.md`](../../../../docs/TO_REVIEW.md)).                                                                 |

Removed from production **2026-06-18** (Phase 8): `ReactivePortBus`,
`NodeActivityTracker`, `wireReactiveNodes`, `dispatch-port-emit`, server batch
loops ([`REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md) § «Removed legacy stack»).

---

### Production gen 3 — `@langflower/runtime` (historical name `WorkflowRuntime`)

**What it was** ([`EXECUTION_ARCHITECTURE.md`](../../../../docs/EXECUTION_ARCHITECTURE.md);
server cutover **2026-06-18**)

- Early package surface: `createWorkflowRuntime()`, `materializeRunGraph`,
  `RuntimeOutputBus`, `graph-scope`, `HitlChannel`, `interruption.ts`.
- **Single reactive-first pipeline**: all nodes (including `defineNode`) go
  through adapters; server has no separate batch topo loop.
- Draft graph + **immutable snapshot** per run; scoped edge subscriptions
  disposed on terminal status; graph locked while run active.
- Run cycle boundaries via reactive run tracking — **not** output Observable
  `complete` ([`REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md)).
- Loop policies in runner: Review accept auto-settles; interactive Ask User HITL
  runs until stop only ([ADR-015](../../../../docs/ADR.md#adr-015--interactive-hitl-feedback-loops-end-on-stop-not-idle-settle)).

**Pain that drove the editor/runner split (this ADR)**

| Problem                         | Symptom / design flaw                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Fat runtime**                 | Output map, node state map, HITL channel, progress, materialization — hard to unit-test without server adapters. |
| **Run = materialization event** | Wiring recreated every run; port objects outlive runs but lifecycle is run-scoped.                               |
| **Mixed completion policies**   | Interactive HITL vs Review accept vs one-shot batch still branch inside a combined runner.                       |
| **UI/WS coupling**              | Rich contracts shaped for session bridge, not a minimal reactive editor core.                                    |

**Superseded:** production no longer has a `WorkflowRuntime` symbol or
`src/v2/` tree. Server binds **`RuntimeFacade`** (`RuntimeEditor` +
`RuntimeRunner`) from [`runtime.ts`](./src/runtime.ts).

---

### Experimental v2 — early prototype: acyclic auto-`done` (removed 2026-06-20)

**What it was**

First cut at a **persistent `Runtime` class** in this folder: editor holds
nodes/edges; `start()` / `interrupt()` connect/disconnect `StatefulConnection`
ports. It **re-imported gen 1 completion intuition**:

- Cluster sequencing (`runClustersSequence`), terminal output detection
  (`collectTerminalOutputKeys`), `awaitClusterCompletion` via
  `firstValueFrom(output.value$)` → global `done` for acyclic graphs.

**What was wrong** — see [`FOUND_BUGS.md`](./FOUND_BUGS.md); superseded by this ADR.

---

### Experimental v2 — run until stopped

One rule: **`running` until `interrupt` or explicit end**. Natural `done` only
for empty graph and `stopsRun` finish nodes. Applies gen 3’s core lesson
(«node output completion is not run completion») without gen 3’s materialization
stack — but **not production** until server migrates off `WorkflowRuntime`.

## Context

The acyclic auto-`done` prototype (above) broke down in practice for:

- HITL / feedback loops (correctly never `done`, but acyclic paths behaved
  differently)
- Editor lifecycle (`stopped` → `start` without an `idle` hop)
- Re-runs after graph edits (stale hot observables vs `firstValueFrom` on
  terminal ports)
- Product intent: reactive workflows stay live until the user stops or an
  explicit sink finishes the session

## Decision — lifecycle

**Default:** a run stays `'running'` until explicitly ended.

**Run ends (`done` → `idle`) only when:**

1. **Empty graph** — `start()` on zero nodes emits instant `done` so the editor
   unlocks without `interrupt`.
2. **Finish node** — a {@link RuntimeNode} with `stopsRun: true` emits a
   **value** on a watched output port; runtime calls `finishRun(runId)` (deferred
   via `queueMicrotask` so wiring finishes before teardown).

**Run ends (`stopped`) when:**

- {@link RuntimeRunner.interrupt}(`'cancel'`) tears down wiring.

**Removed (v2 auto-done prototype):**

- Auto-done for acyclic graphs (`awaitClusterCompletion`,
  `scheduleDoneCheck`, `runClustersSequence`)
- `ActiveRun.acyclic`, `doneOutputKeys`
- `collectTerminalOutputKeys`, `collectScopeOutputKeys`

**Kept:**

- editor-owned graph clusters for {@link RuntimeRunner.startNode} scope only
- {@link RuntimeRunner.start} wires **all** nodes and edges in one scope

**Node metadata (declarative, not enforced by runtime):**

- `emitOncePerActivation?: boolean` — handler contract for sources like
  constant / delay; runtime does not auto-complete on this flag.

## Decision — editor/runner boundary

The previous experimental `Runtime` class became too broad: it owned graph
editing, wire-type validation, cluster discovery, run lifecycle, subscriptions,
and public telemetry streams. Split it into explicit responsibilities:

| Class           | Responsibility                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `RuntimeEditor` | Mutable graph state, node/edge validation, dynamic wire-type pinning, downstream cleanup after disconnect, and cluster calculation.            |
| `RuntimeRunner` | Holds a `RuntimeEditor` reference, locks it while running, selects scopes, wires `StatefulConnection`s, owns run status and telemetry streams. |
| `RuntimeFacade` | Thin convenience wrapper exposing only `readonly editor` and `readonly runner`; it does not proxy methods or re-create the old combined API.   |

`RuntimeEditor` exposes ready-to-use clusters:

- `allClusters: readonly GraphCluster[]` — recalculated after graph mutations.
- `getClusterByNodeId(nodeId)` — returns the current cluster for run-from-node.

`RuntimeRunner.startNode(nodeId)` uses the editor boundary directly:

```text
startNode
  -> editor.getClusterByNodeId(nodeId)
  -> runScope(cluster.nodeIds, cluster.edgeIds)
```

`RuntimeRunner.pushIntoInput({ nodeId, portId, payload })` uses the same
boundary when no run is active:

```text
pushIntoInput (cold start)
  -> editor.getClusterByNodeId(nodeId)
  -> runScope(cluster.nodeIds, cluster.edgeIds)
  -> connect run-owned Subject to inputs[portId]
  -> source.next(payload)
```

When a run is already active, `pushIntoInput` accepts payloads only for nodes in
that active scope. It is an input-port primitive, not a HITL gateway: server/UI
still own HITL metadata, chat semantics, and WebSocket protocol.

Runner code does not call `detectGraphClusters` directly. Cluster ownership
belongs to the editor because clusters are a property of editable graph state,
not of a run.

## Decision — dynamic port metadata

Port names still carry runtime metadata, but `dynamic` has explicit rules:

- Input `wireType: "dynamic"` accepts any first effective wire type.
- Multi-input `dynamic` ports are pinned by the first connected edge; changing
  the pinned type requires removing all edges for that input.
- Output `wireType: "dynamic"` must declare `fromInput`; its effective wire type
  is inherited from that input's current upstream connection.
- A dynamic output without an upstream connection on `fromInput` cannot connect
  downstream.
- Removing an upstream edge can invalidate downstream dynamic outputs; the
  editor removes downstream edges that no longer have an effective type or no
  longer match their target input.

This supports chains of dynamic relays:

```text
static source -> dynamic input/output -> dynamic input/output -> static sink
```

If the first edge is removed, the editor recalculates and disconnects the now
invalid downstream chain.

## Consequences

### Positive

- One lifecycle rule: **running until stop or finish**
- HITL, loops, and linear graphs behave consistently
- `stopped` → `start` works without special re-init for done detection
- Server/UI own session completion; runtime exposes explicit finish nodes
- Reuses **gen 3** insight (decouple run end from Observable `complete`) with a
  thinner surface than `WorkflowRuntime`
- Graph editing and execution can be tested independently.
- `startNode` consumes editor-owned clusters instead of recomputing scope in the
  runner.
- `pushIntoInput` reuses the same cluster boundary for HITL-style entry without
  reintroducing a runner-level `HitlChannel`.
- Dynamic passthrough behaviour is represented as graph validation, not runner
  wiring special cases.

### Negative

- Batch demos need a finish / sink node (or `interrupt`) to reach `idle`
- Tests that awaited acyclic `done` must use finish node or `interrupt`
- Server already uses `RuntimeFacade`; do not reintroduce a combined
  `WorkflowRuntime` API
- Consumers must use `RuntimeEditor` + `RuntimeRunner`, or the thin
  `RuntimeFacade` references
- Editor locking is now an explicit collaboration between runner and editor.

## References

- Spec: [`spec.md`](./spec.md) §6–7
- Types: [`types.ts`](./types.ts) — `RuntimeEditorApi`, `RuntimeRunnerApi`,
  `RuntimeRunnerApi.pushIntoInput`, `RuntimeNode.stopsRun`,
  `emitOncePerActivation`
- Runtime implementation: [`runtime.ts`](./runtime.ts) — `RuntimeEditor`,
  `RuntimeRunner`, `RuntimeFacade`
- Dynamic port metadata: [`port-meta.ts`](./port-meta.ts)
- Test finish node: [`testing/nodes/finish-node.ts`](./testing/nodes/finish-node.ts)
- Dynamic chain workflow test:
  [`testing/workflows/dynamic-chain.workflow.test.ts`](./testing/workflows/dynamic-chain.workflow.test.ts)
- Production history: [`EXECUTION_ARCHITECTURE.md`](../../../../docs/EXECUTION_ARCHITECTURE.md),
  [`DONE/EPICS/README.md`](../../../../docs/DONE/EPICS/README.md),
  [`REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md),
  [`EXECUTION_ARCHITECTURE.md`](../../../../docs/EXECUTION_ARCHITECTURE.md)
- Gen 3 refactor: [`docs/TODO/runtime-refactor.md`](../../../../docs/TODO/runtime-refactor.md),
  [`docs/TO_REVIEW.md`](../../../../docs/TO_REVIEW.md)
- Gen 3 HITL policy: [ADR-015](../../../../docs/ADR.md#adr-015--interactive-hitl-feedback-loops-end-on-stop-not-idle-settle)
- Supersedes v2 bugs in [`FOUND_BUGS.md`](./FOUND_BUGS.md) (second run / start from stopped)
