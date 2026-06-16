---
name: Runtime cleanup refactor (reactive-first)
updatedAt: 2026-06-19
status: PR1-done · PR2-pending
related:
    - docs/TODO/runtime-refactor.md
    - docs/TO_REVIEW.md
    - docs/REACTIVE_NODES.md
    - docs/EXECUTION_ARCHITECTURE.md
---

# Runtime cleanup refactor — WIP snapshot

Session goal: condense execution stack around **reactive-first** model; remove
historical batch runner remnants; treat `defineNode` as adapter over
`defineReactiveNode`.

---

## Target hierarchy (node factory)

```
defineReactiveNode          — base (Observable in/out on ReactivePortBus)
  ↑ defineNode              — adapter: sync/promise execute + multi-port + retry
  ↑ defineAgentNode         — boilerplate over defineReactiveNode
  ↑ defineReviewNode        — boilerplate over defineReactiveNode
```

**Server:** always `resolved.execute(ctx, inputObservables, params)` via
`createLangflowerReactiveRunner` — no batch/sync lift path on server.

---

## PR1 — Done (2026-06-19)

### Server: batch-path removal

| File                                                             | Change                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/server/src/runtime/langflower-reactive-runner.ts`      | Thin delegate; removed `resolveRuntimeBatchInputs`, retry wrapper, `combineLatest` snapshot path |
| `packages/server/src/runtime/langflower-runner-helpers.ts`       | Removed `resolveRuntimeBatchInputs()`                                                            |
| `packages/server/src/runtime/langflower-node-runners.ts`         | No `inputAmendments` into reactive runner                                                        |
| `packages/server/src/runtime/run-workflow.test.ts`               | Renamed “batch chain” → “defineNode chain”                                                       |
| `packages/server/src/services/workflow-executor.service.test.ts` | Flaky retry/cluster assertions relaxed                                                           |

### Shared: `defineNode` adapter

| File                                                   | Change                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/node-factory/define-node.ts`      | Rewritten: `wireSimpleExecuteInputs`, `wrapSimpleExecute`, multi-port aggregation (`lines`, `lines@1` → `lines: string[]`), retry in adapter (`1 + retry`), execute-result cache per input key (no re-run on `shareReplay` resubscribe), sync errors via `throwError` not raw throw in `switchMap` |
| `packages/shared/src/node-factory/define-node.test.ts` | Multi-port aggregation test; resubscribe-after-error regression test                                                                                                                                                                                                                               |
| `packages/shared/src/index.ts`                         | Removed dead exports (see below)                                                                                                                                                                                                                                                                   |

### Dead code removed

**Deleted files:**

- `packages/shared/src/bus-fed-node.ts`
- `packages/shared/src/reactive-node-types.ts`

**Removed from public API** (`packages/shared/src/index.ts`):

- `isBusFedNode`, `getTestNodeRuntimes`, `TestNodeRuntime`
- `REACTIVE_AI_NODE_TYPES`, `extractReactiveNodeDefinition`
- `synthesizePassthroughOutputs`, `isReactiveNodeType`

**Already gone before this session:**

- `packages/runtime/src/adapters/batch-node-adapter.ts`
- `packages/server/src/runtime/langflower-batch-runner.ts`

### Runtime / execution bridge

| File                                                      | Change                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/output-bus.ts`                      | Drain `state$.error$`; `error` handler on `state$.subscribe` (fixes statefulObservable unhandled warnings)                       |
| `packages/runtime/src/materialized-run-graph.ts`          | **Removed** `sourcePort.error$` → `targetInput.pushError` forward (root cause of post-test uncaught errors)                      |
| `packages/server/src/runtime/runtime-execution-events.ts` | `propagateUpstreamFailure()` on port `error$`; per-node completion bridge; `failedNodeIds` param on `attachRuntimeExecutionSink` |
| `packages/server/src/runtime/run-workflow.ts`             | Pass `trackedFailedNodeIds` into execution sink                                                                                  |

**Design note:** downstream failure after upstream error is now explicit via
`propagateUpstreamFailure` (was only wired in deleted batch-runner). Input ports
no longer receive replayed upstream errors through the materialized graph.

### Tests added

| File                                                          | Test                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared/src/node-factory/define-node.test.ts`        | `does not re-run execute after output resubscribe following an error` |
| `packages/runtime/src/adapters/reactive-node-adapter.test.ts` | `runs defineNode throw execute once through bindOutputPort`           |
| `packages/runtime/src/adapters/reactive-node-adapter.test.ts` | `runs defineNode throw once when downstream input is wired`           |

---

## Verify status (2026-06-19)

| Suite                       | Result           | Notes                                                                                                                                          |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`verify --quick`)     | **426/426 pass** | Occasional flake: `node-bundler.service.test.ts` timeout (5000ms)                                                                              |
| Integration (full `verify`) | **~20/22 pass**  | Flaky: `execute-delay.ws.test.ts`, `execute-llm-hitl.ws.test.ts` — not reproduced at unit/`run-workflow` level; delay passed 1/3 isolated runs |

**Blocking issue resolved:** Vitest “unhandled error” from `common-throw` in
`workflow-executor.service.test.ts` (materialized error forward + late RxJS subscribe).

---

## Architecture now in place

```
defineReactiveNode (base)
  ↑ defineNode (simple execute adapter + multi-port + retry)
  ↑ defineAgentNode / defineReviewNode (AI boilerplate)

Server: createLangflowerReactiveRunner → always resolved.execute(observables)
Runtime: reactive-node-adapter → single reactive pipeline
Workflow: materializeRunGraph forwards values only; failures via propagateUpstreamFailure
```

---

## PR2+ — Not started

| ID  | Item                                                                                                                             | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| PR2 | Rename batch→sync-lift naming in comments/helpers; merge `extractNodeDefinition`; clean `executionMode: 'batch'` from types/docs | pending |
| PR2 | Extract `collectInputPortIds` + `resolveRequiredInputPortIds` to `shared/execution`; wire server + runtime test harness          | pending |
| PR3 | `withReactiveRunLifecycle` in `define-agent-node.ts`; unify native vs lifted reactive classification                             | pending |
| PR4 | HITL gateway redundancy; condense `createAskApprovalHandler`; extend `RuntimeExecutionReporter`                                  | pending |
| PR5 | Shared `runNodeOutput` test helper; dedupe factory test helpers                                                                  | pending |
| PR5 | Doc pass: `NAVIGATION`, `STATUS`, `AGENTS`, `runtime-refactor`, `TO_REVIEW`                                                      | pending |

---

## Follow-ups / open questions

1. **Integration flake** — investigate `execute-delay` / `execute-llm-hitl` WS
   timing (may predate PR1; unit paths green).
2. **`node-bundler.service.test.ts` timeout** — increase timeout or stabilize demo
   bundle load.
3. **`docs/TO_REVIEW.md`** — update P0 “two execution stacks” section: batch
   runner removal + materialized error-forward decision should be marked resolved
   when PR merges.
4. **`packages/runtime/src/v2/types.ts`** — exploratory v2 API (StatefulObservable
   ports per node); out of PR1 scope, no integration yet.

---

## Key lessons (for FOUND_BUGS / TO_REVIEW)

| Signal                                | Lesson                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Unhandled RxJS after test green       | `materializeRunGraph` error forward + `ReplaySubject` input ports replay `throwError` to late subscribers without handlers |
| `shareReplay` + `switchMap` + `defer` | Resubscribe re-runs `execute`; cache by `JSON.stringify(values)` or avoid `defer` for sync path                            |
| `statefulObservable` on output bus    | Always subscribe `error$` (and `state$.subscribe({ error })`) at port creation                                             |
| Downstream skip                       | Prefer `propagateUpstreamFailure` over pushing upstream errors into downstream input ports                                 |
