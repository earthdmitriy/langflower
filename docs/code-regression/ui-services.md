# Code regression — ui-services

## Meta

- Paths: `packages/ui/src/app/services/`
- Date: 2026-07-22
- Coverage: All 15 production modules under the chunk (bridge transport, remount projections, `execution-*-fold.ts` / `execution-catalog.ts`, HITL/chat helpers, thin UI-only services). Representative tests: `workflow-execution.service.test.ts` (HITL/bootstrap reconnect), `execution-chrome-fold.test.ts`, `hitl-projection.test.ts`, `bridge-diagram.service.test.ts`, projection service tests. Re-verified against prior report (2026-07-21) and 2026-07-22 fold extractions.

## Principles check

- **RxJS / `withLatestFrom` — PASS.** Grep over the chunk: zero imports or uses. Feed/HITL classification builds catalog inside `combineLatest([feed, workflow, palette])` or `switchMap` over real catalog streams (`execution-feed-fold.ts`, `execution-hitl-fold.ts`).
- **Cross-feature fold ownership — PASS.** Run gate, feed, chrome, HITL, permissions each have one module-local `scan` (`execution-*-fold.ts`). `WorkflowExecutionService` is a wiring façade + UI-only drafts (`hitlDrafts`, `chatStartPending`, optimistic Subjects).
- **Hydrate / reset policy — PASS.** Feed waits for all three bootstrap snapshots before first classify; `distinctUntilChanged` on feed snapshot identity prevents catalog churn from replay-wiping live turns. HITL hydrate uses explicit `live` guard + `hardReset` on done/interrupt/new run. Chrome keeps settled maps after done (no reset on terminal events). Run gate and permissions use tagged reset actions.
- **Bypass / modelAdapter identity — PASS (looked OK).** No `modelAdapter` or parallel bypass encoders in this tree. `execution-chrome-fold.ts` ignores `typeof event.portId === 'symbol'` (runtime bypass). `bridge-diagram.service.ts` carries `bypassPorts: {}` only as empty `PortsConfig` for unknown palette types — not a resync cache.
- **Immutability / one concern one fold — PASS.** Folds are pure `scan`s; edge effects limited to bridge intents, constructor draft clears, and theme DOM/localStorage.
- **No barrels — PASS.** No `index.ts` under `services/`.
- **`type` not `interface` — PASS.** Local shapes use `type` (`FeedAction`, `HitlFoldState`, `LangflowerConfigLayersProjection`, etc.).
- **Arrow exports — PASS.** Pure helpers use `export const … = (…) => …` (`hitl-projection.ts`, `bridge-diagram.service.ts`, fold modules). Prior `export function` drift is gone.
- **No bridge mirror caches — PASS.** Domain facts stay on `LangflowerBridgeClient.raw`; `BehaviorSubject` only in `ThemeService` (UI-only theme, allowed by AGENTS).
- **Composer entry points — PASS.** Fold factories (`createFeedState$`, `createHitlTriggeredNodes$`, …) list merge sources explicitly; no hidden A→B→C chains.
- **Thin server — N/A** (UI package).

## FOUND_BUGS signals

- **BUG-2026-07-21b (false-ready context / HITL missing after reload)** — **mitigated; re-verified PASS.** `execution-feed-fold.ts` and `execution-hitl-fold.ts` never pair events with `startWith(empty)` lookup maps. Regression test `replays HITL replies when feed arrives before workflow and palette` in `tests/workflow-execution.service.test.ts`.
- **BUG-2026-07-21 (settle wiped reconnect chrome)** — **looked fixed:** `execution-chrome-fold.ts` omits done/interrupt reset; comments cite detachable-long-run S2–S3.
- **BUG-2026-07-17e / parallel HITL siblings** — HITL per-node visibility + `live` hydrate guard; hard-reset on done/interrupt.
- **BUG-2026-07-17 (remount enablement)** — `hasRunnableGraph`, `SelectedNodeProjectionService`, `LangflowerConfigProjectionService` use root `shareReplay` / meaningful `initialValue`.
- **BUG-2026-07-16 (constructor snapshot subscribe / NG0200)** — no `runner.snapshot` constructor subscribe; residual surface is draft-clear subscribes only (see Finding #1).
- **BUG-2026-07-13 (DOM chrome side-channel)** — chrome via fold projections + per-element event slices (`getEventsForNode` / `getEventsForEdge`); no global DOM sweep in this chunk.

## Glue / adapters / parallel types

- **`bridge-diagram.service.ts`** — allowed one-way `RuntimeEdge` / `WorkflowNodePersisted` → ng-diagram boundary (`persistedNodeToDiagram`, `persistedEdgeToDiagram`). Comments forbid round-trip. Filename still says `*.service.ts` but module is pure functions (no `@Injectable`) — naming smell only.
- **No `*Adapter` / `*Mapper` classes** in this chunk.
- **Fold-local projection types** (`HitlControlProjection`, `FeedAction`, `ChromeAction`, `LangflowerConfigLayersProjection`) — UI fold vocabulary, not parallel `@langflower/shared` DTOs. OK.
- **`paletteByType`** — single implementation in `bridge-diagram.service.ts`; reused by `execution-catalog.ts`, `execution-hitl-fold.ts`, `workflow-execution.service.ts`. No duplicate builders.
- **Feature import** — folds import `feed-section` reducers from `features/sidebar/`; allowed per `packages/ui/AGENTS.md` (feature-owned vocabulary).

## Streamlining & simplifications

- Fold extraction (`execution-*-fold.ts`, `execution-catalog.ts`) and `withLatestFrom` removal — **done; hold.**
- Drive `hitlDrafts` / `chatStartPending` clears from existing settle/start fold actions so `WorkflowExecutionService` constructor can stay subscription-free (deferred — Finding #1).
- Rename `bridge-diagram.service.ts` → `bridge-diagram.ts` (or `persisted-to-diagram.ts`) — cosmetic; update imports/tests when touched.
- Replace `entry.hitl as HitlInputConfig` in `hitl-projection.ts` with a narrow type predicate after the `hitl !== undefined` filter.

## Design-flaw fixes

1. **False-ready (BUG-2026-07-21b class)** — **addressed and re-verified.** Catalog maps built inside readiness `combineLatest`; live paths use `switchMap` over catalog Subjects, not empty-started sampling.
2. **Ownership concentration** — **addressed.** Fold pipelines extracted; façade ~510 lines wiring bridge + UI drafts.
3. **Live vs hydrate asymmetry (HITL)** — **addressed.** HITL live path uses `switchMap`; hydrate guarded by `live` flag; feed uses feed-identity dedupe instead — complementary, not contradictory.

## Findings

1. **Severity:** Important  
   **Path / symbol:** `packages/ui/src/app/services/workflow-execution.service.ts` — `constructor` (`merge(runnerDone$, runnerInterrupted$).subscribe`, `isRunning$.subscribe`)  
   **Problem:** Imperative `.subscribe` mutates UI signals outside the fold pipeline. Same constructor surface class as BUG-2026-07-16 (snapshot subscribe footgun). Draft/pending clears are legitimate UI-only edges but bypass the tagged-action model.  
   **Proposed fix:** Emit `hardReset` / `start`-derived actions into permission/HITL/feed settle folds (or a tiny UI-draft fold) and map to draft clears via `toSignal` side-effect-free projection or a single named edge subscriber owned by the fold module.

2. **Severity:** Suggestion  
   **Path / symbol:** `packages/ui/src/app/services/bridge-diagram.service.ts`  
   **Problem:** Filename implies Angular service; file exports only pure converters + `paletteByType`.  
   **Proposed fix:** Rename module (non-`service` suffix); batch import updates.

3. **Severity:** Suggestion  
   **Path / symbol:** `packages/ui/src/app/services/hitl-projection.ts` — `hitlControlsForNode` (`entry.hitl as HitlInputConfig`)  
   **Problem:** `as` after filter; principles prefer guards/predicates.  
   **Proposed fix:** Type predicate on `PortInputConfig & { hitl: HitlInputConfig }`.

4. **Severity:** Suggestion  
   **Path / symbol:** `packages/ui/src/app/services/execution-feed-fold.ts` — `foldFeedState` permission branch (`action.ask.runId as RunId`)  
   **Problem:** Cast at fold boundary; low risk if payload is always typed from bridge.  
   **Proposed fix:** Narrow `RunnerPermissionAskPayload.runId` at the action mapper or use a shared guard from `@langflower/shared`.

## Non-issues / looked OK

- `langflower-bridge.service.ts` — thin `createClient` owner; `ngOnDestroy` closes socket; no RPC/DTO wrappers.
- `selected-node-projection.service.ts` / `langflower-config-projection.service.ts` — correct remount-safe projections; config `scan` partial-updates on slim `session.state.snapshot` only.
- `node-hover.service.ts` / `theme.service.ts` — UI-only transient/local state per AGENTS.
- `execution-catalog.ts` — shared catalog builders; `feedCatalogFromSnaps` single entry for classify context.
- `execution-chrome-fold.ts` — shared `foldChromeState` / `createChromeMap$`; bypass `symbol` portId skipped consistently.
- `execution-run-gate-fold.ts` / `execution-permission-fold.ts` — separate concerns, explicit hard-reset actions.
- `chat-entry-clusters.ts` — pure cluster gating; union-find mutates local `parent` map only inside helper scope.
- Empty-started `paletteByType$` / `nodeTypeById$` in façade — confined to remount UI gates (`hasRunnableGraph`, idle chat-entry), not feed/HITL classify (commented and verified).
- One-way diagram conversion contract matches AGENTS; no reverse `Edge` → `RuntimeEdge` in this tree.
- No `index.ts` barrels; no REST glue services in this folder.

**Status:** Critical=0 Important=1 Suggestion=3
