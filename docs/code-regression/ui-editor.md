# Code regression — ui-editor

## Meta

- Paths: `packages/ui/src/app/features/editor/`
- Date: 2026-07-22
- Coverage: Full read of all five source/test files in the chunk (`editor-shell.component.ts`, `run-button.component.ts`, `continue-button.component.ts`, `clamp-divider-positions.ts`, `clamp-divider-positions.test.ts`). Cross-checked against `SelectedNodeProjectionService`, `hitl-projection.ts` / `HitlInputConfig`, `docs/PRINCIPLES.md`, `docs/REACTIVITY.md`, `docs/FOUND_BUGS.md` (UI remount / reconnect / divider signals), `packages/ui/AGENTS.md`, and `packages/ui/docs/DIAGRAM_CANVAS.md` § side panel / composer resize. Not a line-by-line style audit of the large shell template.

## Principles check

- **PASS — no barrels / `type` not `interface` / arrow helpers:** No `index.ts` under `editor/`. Local shapes use `type` (`ResizeDrag`, `CheckpointUiState`, `DividerViewportLayout`). Utils are arrow functions.
- **PASS — bridge as source of truth (intents):** Run / interrupt / resume / discard / dividers / HITL+permission go through `LangflowerBridgeService.raw['*.requested']` or `WorkflowExecutionService` — no REST/DTO glue in this chunk.
- **PASS — domain types reused:** `DividerPositions`, `RunnerPermissionAskPayload`, `WorkflowCheckpointSummary`, `RunnerResumeFailedPayload` from `@langflower/shared/langflower`; HITL `role` from `@langflower/node-sdk` `HitlInputConfig`.
- **PASS — prepare-then-mutate (dividers):** Pure clamp math in `clamp-divider-positions.ts`; shell applies via signal sets + short persist edge. Unit tests cover drag max / viewport shrink.
- **PASS — feature slice layout / composition boundary:** `editor-shell` composes canvas / palette / sidebar / topbar at the shell without owning their domain folds or ngDiagram mutation.
- **PASS — ngDiagram at boundary:** No ngDiagram imports or canvas model writes in this chunk; canvas stays in `features/canvas/`.
- **PASS — remount-safe projections:** `RunButtonComponent` consumes root `SelectedNodeProjectionService.selectedNodeId` (`shareReplay` upstream) — no local bus merge (BUG-2026-07-17b class addressed).
- **PASS — divider lifecycle subscriptions:** Constructor divider snapshot handlers use `takeUntilDestroyed(this.destroyRef)` (`editor-shell.component.ts` ~551–562).
- **PASS — inbound divider clamp does not echo-persist:** `applyDividerPositions` clamps for display only; persist stays on user drag end and post-measure `reclampToViewport(true)` (`editor-shell.component.ts` ~728–744, ~786–800). Matches DIAGRAM_CANVAS.md.
- **PASS — `withLatestFrom`:** None in this chunk.
- **PASS — HITL Start/Stop slot:** Filters on `config.role === 'chat-start'`, not `submitLabel` string copy (`editor-shell.component.ts` ~501–518).
- **N/A — thin server / composer entry points:** UI chrome only; no server domain growth.

## FOUND_BUGS signals

- **BUG-2026-07-17b** (remounted Run/Stop / non-replaying Subject) — **addressed:** `run-button.component.ts` uses `SelectedNodeProjectionService` + `WorkflowExecutionService.hasRunnableGraph()`; never disables Stop while running.
- **BUG-2026-06-26i** (init/hydrate echo treated as user mutation) — **addressed for inbound dividers:** snapshot/cross-tab apply no longer schedules persist before layout measure. Intentional `ResizeObserver` reclamp+persist on shrink is documented in `DIAGRAM_CANVAS.md`.
- **BUG-2026-07-16** (eager snapshot `.subscribe` / circular load) — **low direct risk here** (feature component, not root service); divider subs now lifecycle-scoped.
- **BUG-2026-07-21b** (false-ready `withLatestFrom`) — **none in this chunk**; HITL tabs consume `WorkflowExecutionService` projections only.
- **BUG-2026-07-21f** (run gate unicast) — ownership is platform bridge fan-out, not this chunk; shell only renders shared execution projections.
- Canvas chrome / port-staleness bugs (BUG-2026-07-11 family, BUG-2026-07-21e) — ownership is `canvas/`, not this chunk.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` files** in the chunk. Bridge intents are direct.
- **`CheckpointUiState`** — legitimate UI-only fold in `continue-button.component.ts`, not a mirrored graph/domain type.
- **`nodeId as NodeId`** in `run-button.component.ts` ~133 — tiny cast at the runner intent boundary because `SelectedNodeProjectionService.selectedNodeId` is `string | null`.
- **`hitlActionsForActiveTab` identity map** — remaps `{ nodeId, portId, config }` to the same shape; could pass `activeHitlTabEntry()?.actions` directly (noise, not a boundary adapter).
- **Stringly HITL Start gate** — **removed;** `role: 'chat-start' | 'reply'` is owned in `node-definitions` and set by Chat Input node.

## Streamlining & simplifications

- `editor-shell.component.ts`: optional — replace divider snapshot `.subscribe` pairs with one `toSignal(merge(...).pipe(map(applyClamp)))` if a future refactor wants zero imperative subscribe in the class body (lifecycle is already safe).
- `editor-shell.component.ts`: collapse `hitlByNode` → `hitlTabs` into one `computed` (intermediate array has no other consumers).
- `editor-shell.component.ts`: drop `hitlActionsForActiveTab` identity `.map` — use `activeHitlTabEntry()?.actions ?? []` in downstream computeds.
- `continue-button.component.ts`: derive `resumableCount` from `canResumeEntry` so the badge matches Resume-eligible rows.
- `continue-button.component.ts`: call `checkpointTitle` / `formatCheckpointTime` from the template (or drop `titleFor` / `formatTime` wrappers).
- `run-button.component.ts`: type selection projection as `NodeId | null` upstream to remove the `as NodeId` cast.

## Design-flaw fixes

1. **Remount-local bus folds (selection):** ~~Assumption that a component-local merge is enough~~ — **fixed** via root `SelectedNodeProjectionService` + runnable-graph gate in `WorkflowExecutionService`.
2. **Clamp-then-persist as write-back:** ~~Inbound snapshot clamp auto-persist~~ — **fixed**; persist only on user drag end and documented post-measure reclamp.
3. **Composer Start vs Stop keyed by label string:** ~~`submitLabel === 'Start'`~~ — **fixed** via `HitlInputConfig.role`.

## Findings

1. **Severity:** Suggestion
    - **Path / symbol:** `packages/ui/src/app/features/editor/components/continue-button.component.ts` — `resumableCount` (~236) vs `canResumeEntry` (~250–258)
    - **Problem:** Footer shows `Continue from… (N)` where `N` is all checkpoints, including stale/corrupt rows that only offer Discard. Mild UX inconsistency.
    - **Proposed fix:** Count/filter with `canResumeEntry`, or rename the badge to “checkpoints”.

2. **Severity:** Suggestion
    - **Path / symbol:** `packages/ui/src/app/features/editor/components/editor-shell.component.ts` — `hitlByNode` (~415–425) → `hitlTabs` (~431–448)
    - **Problem:** Extra computed hop; `hitlByNode` is only consumed by `hitlTabs`.
    - **Proposed fix:** Inline the mapping inside `hitlTabs`.

3. **Severity:** Suggestion
    - **Path / symbol:** `editor-shell.component.ts` — `hitlActionsForActiveTab` (~492–499)
    - **Problem:** Identity remap of `HitlControlProjection` fields adds noise without changing shape.
    - **Proposed fix:** Filter `activeHitlTabEntry()?.actions ?? []` directly in `hitlReplyActionsForActiveTab` / `hitlStartActionForActiveTab`.

4. **Severity:** Suggestion
    - **Path / symbol:** `continue-button.component.ts` — `titleFor` / `formatTime` (~242–248)
    - **Problem:** One-line wrappers around module helpers; they do not meaningfully shrink call sites.
    - **Proposed fix:** Bind helpers in the template or expose them as readonly component fields once.

5. **Severity:** Suggestion
    - **Path / symbol:** `run-button.component.ts` — `nodeId as NodeId` (~133)
    - **Problem:** Cast glue at the intent boundary.
    - **Proposed fix:** Export/bring `NodeId` into `SelectedNodeProjectionService.selectedNodeId` if the runtime branded type can be threaded from `EditorSelectedNodePayload`.

6. **Severity:** Suggestion
    - **Path / symbol:** `editor-shell.component.ts` — divider snapshot `.subscribe` (~551–562)
    - **Problem:** Still imperative subscribe → signal writes (though lifecycle-safe with `takeUntilDestroyed`). REACTIVITY prefers `toSignal` / tagged-action fold when hydrating UI-only layout state.
    - **Proposed fix:** Optional refactor to `toSignal(merge(sessionDivider$, editorDivider$).pipe(map(clamp)))` with the same `applyDividerPositions` semantics.

## Non-issues / looked OK

- No `withLatestFrom`, no barrel `index.ts`, no `interface`, no `any`, no `BehaviorSubject` caches.
- Divider math is pure, tested, and aligned with `DIAGRAM_CANVAS.md` mins/gutters (`w-1` / `h-1`).
- Continue-button checkpoint fold (`merge` → `scan` → `toSignal`) is a clean module-local UI fold; intents use typed bridge keys.
- Shell HITL/permission UI reads `WorkflowExecutionService` / pending asks — does not re-fold execution feed locally.
- Theme / settings / hover / resize drag signals are legitimate UI-only local state per `packages/ui/AGENTS.md`.
- Settings-close-on-selection `effect()` is a allowed UI-sync edge, not a hidden domain reducer.
- `OnPush` standalone components; bridge-first Run/Stop/Continue wiring.
- Previously Critical/Important items (remount selection, divider echo-persist, HITL role gate, divider `takeUntilDestroyed`) verified fixed in current tree.

## Status

Report: `docs/code-regression/ui-editor.md` — Critical=0 Important=0 Suggestion=6
