---
kind: bug
owner: docs
covers: []
status: current
date: 2026-06-18
flaw: Two execution adapters
package: shared
fixed: yes
---

### BUG-2026-06-18 — Legacy ReactivePortBus: switchMap + hot inputs never settled runs

| Field                  | Value                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**               | 2026-06-18                                                                                                                                                                                                                                                |
| **Area**               | execution · shared · reactive                                                                                                                                                                                                                             |
| **Status**             | fixed (stack deleted)                                                                                                                                                                                                                                     |
| **Symptom**            | Review/agent reactive runs hung in legacy tests: `waitForIdle` timed out after feedback emit; `combineLatest` on hot bus inputs never completed inner `switchMap` runs.                                                                                   |
| **Repro**              | Wire review node through `createReactiveNodeRuntime` + `ReactivePortBus`; emit task/result; observe feedback port emits but tracker stays pending until timeout.                                                                                          |
| **Root cause**         | Legacy adapter used `switchMap` per input event without run-scoped lifecycle aligned to terminal port emit; hot `Subject` inputs never `complete`; `Observable.complete` on output was required for idle in tests but production hot bus never completes. |
| **Fix**                | Production path uses `@langflower/runtime` (`ReactiveRunTracker`, `completeReactiveRun` in node `finalize` via `withReactiveRunLifecycle`). Legacy bus stack removed from shared (Phase 8).                                                               |
| **Design flaw signal** | **Two execution adapters** duplicated lifecycle rules; hot-input reactive graphs need explicit run boundaries, not Observable `complete` on upstream.                                                                                                     |
| **Regression test**    | `packages/runtime/src/common-nodes/review-nodes.test.ts`, `packages/runtime/src/adapters/reactive-node-adapter.test.ts`                                                                                                                                   |
