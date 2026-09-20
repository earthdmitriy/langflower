# Code regression — runtime

## Meta

- Paths: `packages/runtime/src/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Reconciled every 2026-09-19 finding against current source. Re-read production modules (`runtime.ts`, `runtime-editor.ts`, `runtime-runner.ts` including `runScope` / `emitPortEvent` / `wireScope` / seed / default / push / multy `'in'` sites, `bypass-ports.ts`, `port-meta.ts`, `runtime-helpers.ts`, `types.ts`, `normalize-port-error-value.ts`). Sampled `port-meta.test.ts`, `port-feed-meta.test.ts`, `runtime-helpers.test.ts`, `bypass-ports.test.ts`. Skimmed `testing/` harness / workflow files — not a line-audit of every scenario. ts-scan: `graphHasCycle` not found; `PortMeta` owns `types.ts` (`portId`, not `name`); `ReactivePortBus` not found; `port-meta.test.ts` excluded from the package tsconfig. Read PRINCIPLES / REACTIVITY / FOUND_BUGS / LEDGER. No `packages/runtime/AGENTS.md`.
- Previous report: 2026-09-19 — Critical=0 Important=4 Suggestion=5

## Previous findings (delta mode)

| id                                   | severity   | status     | evidence                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime-graph-has-cycle`            | Important  | fixed      | LEDGER Closed 2026-09-19. `graphHasCycle` is gone from `runtime-helpers.ts` (file now ends at `collectClusterSlotKeys`). ts-scan `resolve_symbol` against `runtime-helpers.ts` → not found. Helpers tests import `detectGraphClusters` / `collectClusterSlotKeys` / `clusterHasChatEntry` / `resolveClusterForNode` only. Do not reopen.                                                                 |
| `runtime-wire-scope-swallowed-throw` | Important  | fixed      | LEDGER Closed 2026-09-19. `runScope` still fences `wireScope` in `queueMicrotask`; the microtask `catch` now emits `['done', resolvedRunId]` (`runtime-runner.ts` ~L751–L759) instead of an empty swallow. Do not reopen.                                                                                                                                                                                |
| `runtime-missing-node-cluster`       | Important  | fixed      | LEDGER Closed 2026-09-19. `RuntimeEditor.getClusterByNodeId` returns `false` when the node is absent (`runtime-editor.ts` L283–L288). `startNode` / `pushIntoInput` return `false` on that miss. Published type is `GraphCluster \| false`. Do not reopen.                                                                                                                                               |
| `runtime-port-meta-test-ghost`       | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                                                                                                                          |
| `runtime-jsdoc-contract-leftovers`   | Suggestion | still-open | `RuntimeRunnerApi.start` JSDoc still says “Throws if status is already `'running'`” while the impl returns `false`. Module status section still writes `events$` `kind: 'done'`. `events$` JSDoc still says “`runId` on each frame” while `PortTelemetry` documents no per-frame `runId`. Helpers still `{@link Runtime}`. Unused `_runId` on `emitPortEvent` is **not** re-filed (epic-47 instruction). |
| `runtime-add-edge-commit-rollback`   | Suggestion | still-open | `addEdge` still rolls back occupancy fails, then `return this.commitEdgeInsert(...)` with no rollback. `commitEdgeInsert` still returns `false` on a duplicate `edgeId` and leaves `prepareEdgeInsert` bypass materialization on the node (`runtime-editor.ts` L106–L107, L432–L440).                                                                                                                    |
| `runtime-wire-scope-shape`           | Suggestion | still-open | Perennial (LEDGER; runs 2026-07-22, 2026-09-19). `wireScope` is still one composer inlining index maps, tap wrap, connect, multy, demand subscribe, and seeds (`runtime-runner.ts` ~L928–L1318). No new mechanism — kept Suggestion, not re-filed as fresh.                                                                                                                                              |

## Principles check

- **Single execution engine — PASS:** ts-scan `ReactivePortBus` / historical `WorkflowRuntime` not found. Surface is `RuntimeFacade` = `RuntimeEditor` + `RuntimeRunner`.
- **RuntimeFacade ownership — PASS:** Thin holder of `readonly editor` / `readonly runner`.
- **No constructor `subscribe` / no `withLatestFrom` / no barrels / no `interface` — PASS:** Zero matches in `packages/runtime/src/`. Demand `watched.subscribe` in `wireScope` is the end-node / `stopsRun` pull (BUG-2026-07-21d), not a field writer.
- **`tap` allow-list — PASS:** Port taps emit telemetry only. `stopsRun` finish is `scheduleFinishOnSuccessValue` after a named subscribe.
- **Type ownership — PASS (ADR-027):** Execution contracts live in `types.ts`. SDK `PortMeta` twin remains the accepted DAG split.
- **Functional errors — PASS (closed LEDGER items):** Missing node is `false`. `wireScope` throw emits `['done', runId]`. Editor mutations still return `false`.
- **Delete obsolete — FAIL (listed class):** `port-meta.test.ts` still exercises a deleted `PortMeta.name` shape from the wrong module (`docs-ghost`).
- **Docs match impl — FAIL (listed class):** leftover throw / object-`done` / per-frame `runId` JSDoc (`docs-ghost`).
- **Composer — mixed, not a FAIL class:** `addEdge` prepare → occupancy rollback → commit still misses rollback when `commitEdgeInsert` returns `false` (same Suggestion as 2026-09-19).
- **Thin server / DAG — PASS:** Runtime depends only on `@rx-evo/stateful-observable` and `rxjs`.
- **Epic 47 feed stamp — PASS:** `'in'` sites pass target `meta.feed`; `emitPortEvent` always writes slot 6 as `RuntimeFeedPortMeta \| null` (`portFeed ?? null`, or `{ …, closesPreviousVisit: true }`). Type comment: never `undefined` (JSON arrays drop it). `port-feed-meta.test.ts` locks target feed + boundary stamp. Not a finding.

## FOUND_BUGS signals

none

BUG-2026-09-20 (SDK input `feed` never reached the work log) is **addressed**, not a recurrence: every `'in'` emit site now passes target `feed`; slot 6 is `null` or an object. Bypass / telemetry / default / demand / merge-limitation bugs from the previous report remain addressed or documented; no same-mechanism return.

## Glue / adapters / parallel types

none

ADR-backed copies, not flagged: SDK ↔ runtime `PortMeta` ([ADR-027](../architecture/ADR.md#adr-027--author-sdk-owns-port-types-no-production-runtime-dep)). Bypass identity module remains required conversion (BUG-2026-07-20). `RuntimeEditorApi` / `RuntimeRunnerApi` are the class contracts, not a second implementation.

## Streamlining & simplifications

none

(`graphHasCycle` already deleted. `wireScope` extract stays the perennial Suggestion — not a dead-export delete. Do not invent a simpler `emitPortEvent`.)

## Design-flaw fixes

none

(Previous Critical-class sketches — swallowed `wireScope` throw, throw-on-missing-node — are LEDGER-closed. Remaining `addEdge` commit hole stays Suggestion, not a Critical sequence.)

## Findings

1.  - id: `runtime-jsdoc-contract-leftovers`

- class: docs-ghost
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/runtime/src/types.ts` — `RuntimeRunnerApi.start` / `events$`; module status section; `runtime-helpers.ts` — `detectGraphClusters` JSDoc
- evidence: `start` JSDoc still teaches throw-on-running; implementation returns `false`. Module doc still writes `events$` `kind: 'done'` (object shape). `events$` JSDoc still says “`runId` on each frame” while `PortTelemetry` says the opposite. Helpers `{@link Runtime}` points at a deleted type (`RuntimeFacade` is the holder).
- proposed fix: Align JSDoc with the tuple + `| false` implementation; retarget `{@link Runtime}` to `RuntimeFacade` / `RuntimeRunner`.

2.  - id: `runtime-add-edge-commit-rollback`

- class: fail-open-io
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/runtime/src/runtime-editor.ts` — `addEdge` → `commitEdgeInsert`
- evidence: Occupancy failure calls `rollbackBypassMaterialization`. Duplicate `edgeId` in `commitEdgeInsert` returns `false` and leaves prepared bypass slots on the node. Default UUID path hides it; persisted-id hydrate does not.
- proposed fix: If `commitEdgeInsert` returns `false`, call the same rollback (composer already has the handle from `prepareEdgeInsert`).

3.  - id: `runtime-wire-scope-shape`

- class: (perennial streamlining — LEDGER; not a new closed-list defect)
- severity: Suggestion
- first-seen: 2026-07-22
- status: open
- path: `packages/runtime/src/runtime-runner.ts` — `wireScope`
- evidence: Perennial LEDGER row (2026-07-22, 2026-09-19). Same method, same size/shape Suggestion — no new mechanism, not re-filed as a fresh id. `wireScope` still inlines index maps, tap wrap, default-clear, per-edge connect, multy combine/zip/merge, demand subscribe, and seeds (~L928–L1318).
- proposed fix: Keep `wireScope` as the entry; extract sibling steps listed in call order. Optional; do not treat size alone as a ship blocker.

## Non-issues / looked OK

- LEDGER Closed — re-confirmed, not reopened: `runtime-graph-has-cycle`, `runtime-wire-scope-swallowed-throw`, `runtime-missing-node-cluster`.
- Perennial `runtime-wire-scope-shape` kept as the same Suggestion (no new mechanism).
- Epic 47: `emitPortEvent` always emits slot 6 (`null` or a feed object). `closesPreviousVisit` is merged onto that object, including role-less errors. Not “could be simpler.”
- Dual engines / `ReactivePortBus` / `WorkflowRuntime` / `src/v2/` — still gone.
- `tap` → `finishRun` — still closed. Bypass pass-through wrappers — still deleted. `runtime.ts` `graphHasCycle` re-export — still deleted.
- Constructor `subscribe` — still absent. No `withLatestFrom`. No `index.ts` barrel.
- ADR-027 SDK port twins — not flagged.
- July Critical `collectClusterSlotKeys` phantom `ch@1@0` — still skipped via `meta.mode === 'bypass'`.
- Merge `value$` loader limitation — documented; blocked on `@rx-evo`.
- Style (`function` vs arrow) and unary `['done']` union width are not listed classes.
- `BehaviorSubject` `status$` is runner lifecycle, not a UI fold store.
- Package DAG: runtime → `@rx-evo` + `rxjs` only.
