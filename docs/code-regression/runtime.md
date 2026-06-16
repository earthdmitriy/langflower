# Code regression — runtime

## Meta

- Paths: `packages/runtime/src/`
- Date: 2026-07-22
- Coverage: Production modules (`runtime.ts`, `runtime-editor.ts`, `runtime-runner.ts`, `bypass-ports.ts`, `port-meta.ts`, `runtime-helpers.ts`, `types.ts`) plus unit tests (`bypass-ports.test.ts`, `runtime-helpers.test.ts`, `resume.workflow.test.ts`, `router.workflow.test.ts`). Skimmed `testing/` harness nodes and workflow scenarios; did not line-audit every workflow file. Read `docs/PRINCIPLES.md`, `docs/REACTIVITY.md`, `docs/FOUND_BUGS.md`, `packages/runtime/ADR.md`, `packages/runtime/FOUND_BUGS.md`. No `packages/runtime/AGENTS.md`.

## Principles check

- **RuntimeFacade ownership — PASS:** `RuntimeFacade` (`runtime.ts`) is a thin holder exposing `readonly editor` and `readonly runner`; no method-proxy glue. Server binds `RuntimeFacade` (`packages/server/src/session/langflower-session.ts`).
- **Runner folds — N/A (by design):** Runtime kernel does not use UI-style `merge → scan` folds; run lifecycle is imperative (`BehaviorSubject` status, `Subject` events, `ActiveRun` wiring maps). Correct layer per REACTIVITY taxonomy (runtime demand, not UI projection).
- **Thin boundaries — PASS:** Execution-only contracts in `types.ts`; HITL/WS/persistence explicitly out of scope. Deliberate duplicate edge validation at UI/server/runtime (documented in `types.ts`) is not an adapter shim.
- **Immutability — PASS (owned mutable graph):** Editor/runner use `Map`/`Set` for graph/run bookkeeping; node spreads on bypass materialization; edge wiring uses immutable connection objects.
- **Telemetry on dataflow — PASS (with one caveat):** `tapOutputPort` / `tapInputPort` / multy combine attach telemetry to the connected stream (BUG-2026-07-15/16 class addressed). End-node empty `subscribe` is an intentional demand driver (BUG-2026-07-21d alignment). **Caveat:** `tapOutputPort` also triggers `finishRun` — see finding #6.
- **Bypass identity — PASS (centralized):** Encode/decode in `bypass-ports.ts`; UI re-exports same helpers (`packages/ui/src/app/diagram/diagram-port-id.ts`).
- **Merge fan-in — documented limitation:** `mode: 'merge'` uses `loader: () => merge(...value$)` only; full `raw$` merge blocked on `@rx-evo` (BUG-2026-07-15c). Documented on `PortMeta.mode` in `types.ts`.
- **No `withLatestFrom` — PASS:** Zero matches under `packages/runtime/src/`.
- **No barrels — PASS:** No `index.ts` / `export * from`. Package entry re-exports via `runtime.ts` + `package.json` `exports["."]` (publish surface, not a feature-folder barrel). Secondary export `./port-meta` is a concrete module path.
- **Composer entry points — PASS (editor) / mixed (runner):** `RuntimeEditor.addEdge` / `replaceEdge` document prepare → check → commit. `RuntimeRunner.wireScope` (~370 lines) lists phases in comments but has no flat sibling step list at the top.
- **Feature slices — PASS:** Editor / runner / bypass / port-meta / helpers split matches ADR editor/runner boundary; tests colocated under `testing/`.
- **Type ownership — PASS:** Branded ids and `PortMeta` live here; no mirrored `WorkflowGraph` types. `interface` absent from production contracts.
- **Arrow functions — PARTIAL:** `bypass-ports.ts`, `port-meta.ts` use arrow exports; `runtime-helpers.ts` and most tests still use `function`.

## FOUND_BUGS signals

- **BUG-2026-07-20 / BUG-2026-07-22b** (bypass slot identity) — **addressed:** `bypass-ports.ts` is the mandatory conversion layer; `wireScope` uses `checkpointPortIdForSlot`; UI `toSlotHandle` / `splitSlotHandle` re-export runtime helpers. Round-trip in `bypass-ports.test.ts`; resume in `resume.workflow.test.ts`.
- **BUG-2026-07-15** (bypass telemetry not on dataflow) — **addressed:** `wireScope` prefers `watchedByKey` tapped wrappers; regression in `router.workflow.test.ts`.
- **BUG-2026-07-16** (telemetry as separate subscribers reordering events) — **addressed:** taps ride connect path; no parallel refCounted watcher for wired ports.
- **BUG-2026-07-12b** (defaults winning first tick) — **addressed:** clear wired inputs before connect; defaults/seeds after end-node demand subscribe.
- **BUG-2026-07-15c** (merge fan-in / `@rx-evo` raw$ gap) — **closed, blocked on library:** documented limitation; reopen only when `@rx-evo` ships merge-of-`raw$`.
- **BUG-2026-07-21d** (passthrough demand) — **aligned:** empty `watched.subscribe(() => {})` on unwired terminal outputs keeps cold shared streams hot; not `withLatestFrom`.
- **BUG-2026-07-22b regression class** (double SlotKey `ch@1@0`) — **addressed:** `collectClusterSlotKeys` skips `meta.mode === 'bypass'` on outputs map; unit test `collects bypass slots once (no ch@1@0 double key)`.

## Glue / adapters / parallel types

- No `*Adapter` / `*Mapper` classes in production `src/`.
- **Intentional isolation types:** `RuntimeNode`, `RuntimeEdge`, `PortMeta` are execution contracts, not mirrors of persisted workflow shapes (`types.ts` module doc).
- **Soft identity overload:** synthetic `EdgeId`s `` `push:${key}` ``, `` `multy:${…}` ``, `` `seed:${key}` ``, `` `default:${key}` `` in `runtime-runner.ts` — bookkeeping handles, not graph edges (finding #7).
- **Package-entry re-export list** in `runtime.ts` — acceptable publish surface.
- **Doc-only “adapter” mentions** in `types.ts` (`defineNode` / sync lift, server telemetry adapter) refer to out-of-package boundaries, not in-package glue.
- No ADR-backed adapter inside this package; historical gen-2 `reactive-node-adapter` is gone.

## Streamlining & simplifications

- **`wireScope` composer:** Extract sibling private steps (index edgeIds → build `watchedByKey` → clear defaults → connect singles/bypass → multy groups → demand-subscribe terminals → defaults/seeds) under one top-level comment block — same pattern as `RuntimeEditor.addEdge`.
- **`collectClusterSlotKeys`:** Fix verified; no further change needed unless new bypass view keys appear on `outputs`.
- **`getBypassBasePortId`:** Materializes only `Object.keys(bypassPorts)[0]` on add; document single-base invariant or materialize every key if multi-base routers become real.
- **Synthetic disconnect keys:** Track teardown targets via `WiredInputSlot.connection` only; drop fake `EdgeId` strings from `wiredSlots`.
- **Naming/docs:** Rename `testing/lyfecycle/` → `lifecycle/` when touching tests; refresh `types.ts` header (“v2 runtime contracts”) to “editor/runner runtime contracts”.
- **Style:** Convert remaining `function` exports in `runtime-helpers.ts` to arrows for repo consistency.

## Design-flaw fixes

1. **Bypass port identity (three encodings)** — mitigated by `bypass-ports.ts`; regression risk remains if new call sites concatenate `@` outside the module. Keep exports as the only public conversion API.
2. **Output-map enumeration ≠ slot enumeration** — mitigated in `collectClusterSlotKeys`; any future slot discovery must not treat materialized `ch@n` output ids as base port segments.
3. **Merge fan-in incomplete without `@rx-evo` raw$ merge** — closed / blocked on library; documented on `PortMeta.mode: 'merge'`.
4. **`tap` used for run completion control flow** — `tapOutputPort` calls `finishRun` inside `tap.next` (finding #6); couples telemetry wrapper to lifecycle. Move completion to an explicit edge after signal resolution (e.g. narrow operator or post-connect hook), keeping `tap` telemetry-only per REACTIVITY allow-list.
5. **Hot `events$` without replay** — by design (`types.ts`); server must subscribe before run start (BUG-2026-07-14 class fixed server-side). Runtime behavior is correct; not a runtime defect.

## Findings

1. **Severity:** Critical — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `packages/runtime/src/runtime-helpers.ts` — `collectClusterSlotKeys`; consumers `RuntimeRunner.wireScope` (`watchedByKey`, end-node demand subscribe)  
   **Problem:** Enumerating all `node.outputs` keys after bypass materialization produced phantom SlotKeys (`node.ch@1@0`) and duplicate telemetry/demand taps on the same bypass connection.  
   **Fix in tree:** Outputs loop skips `meta.mode === 'bypass'`; bypass slots enumerated only from `bypassConnections`. Test: `runtime-helpers.test.ts` — `collects bypass slots once (no ch@1@0 double key)`.

2. **Severity:** Important — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `packages/runtime/src/bypass-ports.ts`; `runtime-runner.ts` — `wireScope` (`checkpointPortIdForSlot`, `getBypassConnection`); UI `diagram-port-id.ts` — `toSlotHandle` / `splitSlotHandle`  
   **Problem:** BUG-2026-07-20 / BUG-2026-07-22b — three encodings (edge tuple, checkpoint `ch@n`, SlotKey `base@index`) converted ad hoc.  
   **Fix in tree:** Single conversion module; round-trip tests in `bypass-ports.test.ts`; UI re-exports runtime helpers.

3. **Severity:** Important — **closed / blocked on library (2026-07-22, re-verified)**  
   **Path / symbol:** `packages/runtime/src/runtime-runner.ts` — `wireScope` multy branch (`statefulObservable({ loader: () => merge(...value$) })`); `types.ts` — `PortMeta.mode: 'merge'` limitation  
   **Problem:** Merge fan-in drops loading/error/inactive from sources (BUG-2026-07-15c).  
   **Status:** Documented limitation; not an open Langflower Important until `@rx-evo` exports merge-of-`raw$`.

4. **Severity:** Important — **addressed (2026-07-22, re-verified)**  
   **Path / symbol:** `packages/runtime/src/types.ts` — module doc § Multi-input ports  
   **Problem:** Obsolete prose claimed cardinality in connection name strings.  
   **Fix in tree:** Doc points at `PortMeta.mode` + edge slot ordering + merge limitation.

5. **Severity:** Important — **partial (re-verified 2026-07-22)**  
   **Path / symbol:** `packages/runtime/ADR.md` — § “Experimental v2 — run until stopped” (~lines 133–138)  
   **Problem:** Top of ADR correctly marks `RuntimeFacade` as production, but a later subsection still says “**not production** until server migrates off `WorkflowRuntime`”. Server already uses `RuntimeFacade` (`langflower-session.ts`). Misleading for agents auditing ownership.  
   **Proposed fix:** Replace stale paragraph with “superseded — server cutover complete”; keep historical gen-1…3 sections as archaeology only.

6. **Severity:** Important  
   **Path / symbol:** `packages/runtime/src/runtime-runner.ts` — `tapOutputPort` (`tap.next` → `finishRun` via `queueMicrotask`, ~lines 580–590)  
   **Problem:** REACTIVITY / PRINCIPLES allow-list restricts `tap` to telemetry/diagnostics — not domain control flow. Run completion (`finishRun` → `done` → `teardownRun`) is triggered inside the telemetry `tap`, coupling lifecycle to the dataflow wrapper.  
   **Proposed fix:** Emit telemetry in `tap`; detect `stopsRun` + success in a dedicated post-resolution step (e.g. `map` + side-effect at a named private helper called from the connect path, or subscribe on a filtered completion stream owned by `wireScope`), preserving ordering without overloading `tap`.

7. **Severity:** Suggestion  
   **Path / symbol:** `packages/runtime/src/runtime-runner.ts` — `` `push:${key}` ``, `` `multy:${group.nodeId}.${group.portId}` ``, `` `seed:${key}` ``, `` `default:${key}` `` as `EdgeId`  
   **Problem:** Synthetic ids overload `EdgeId` for `teardownRun` disconnect bookkeeping.  
   **Proposed fix:** Store `{ connection }` only in `wiredSlots`; use a small `DisconnectTarget` type instead of fake edge ids.

8. **Severity:** Suggestion  
   **Path / symbol:** `packages/runtime/src/runtime-runner.ts` — `wireScope`  
   **Problem:** Single large method mixes indexing, resume snapshots, clears, connect modes, multy combine, demand subscribe, seeds — order is comment-documented but not composer-flat.  
   **Proposed fix:** Private sibling steps called in sequence from one top-level composer (no new abstraction layer).

9. **Severity:** Suggestion  
   **Path / symbol:** `packages/runtime/src/bypass-ports.ts` — `getBypassBasePortId`, `materializeBypassNodeOnAdd`  
   **Problem:** Only the first `bypassPorts` key is materialized on add; additional bases ignored until `materializeBypassSlot` on edge add.  
   **Proposed fix:** If multi-base routers are in scope, materialize all keys on add; if single-base is invariant, narrow `bypassPorts` typing or assert one key.

10. **Severity:** Suggestion — **partial (2026-07-22)**  
    **Path / symbol:** `packages/runtime/src/runtime-helpers.ts` — `detectGraphClusters`, `collectClusterSlotKeys`, `graphHasCycle` (`function` declarations)  
    **Problem:** Repo style prefers arrow functions; `bypass-ports.ts` / `port-meta.ts` already converted.  
    **Proposed fix:** Convert remaining production `function` exports to `const … = () =>`.

11. **Severity:** Suggestion  
    **Path / symbol:** `packages/runtime/src/testing/lyfecycle/`; `packages/runtime/FOUND_BUGS.md` header (“Runtime v2 — found bugs log”)  
    **Problem:** Typo `lyfecycle`; package log title still says “v2 prototype” though production is editor/runner split.  
    **Proposed fix:** Rename folder + retitle package FOUND_BUGS when editing tests/docs.

## Non-issues / looked OK

- No `withLatestFrom` anywhere under `packages/runtime/src/`.
- No `scan` folds hiding state in `subscribe`/`tap` for UI-style concerns (runtime is not a UI fold owner).
- `isConnectionInactive` one-shot `raw$.subscribe` + immediate unsubscribe is a synchronous edge read, not a hidden reducer.
- `BehaviorSubject` for `status$` is runner lifecycle edge state, not a domain fold store.
- `RuntimeEditor.addEdge` / `replaceEdge` prepare → rollback → commit pattern is clear and tested.
- Resume bypass snapshot lookup via `checkpointPortIdForSlot` aligns with BUG-2026-07-20 fix (`resume.workflow.test.ts`).
- `events$` hot-only semantics documented; server owns subscription timing.
- Package DAG clean: runtime depends only on `@rx-evo/stateful-observable` and `rxjs`.
- Testing harness under `testing/` is appropriately isolated from production surface.
