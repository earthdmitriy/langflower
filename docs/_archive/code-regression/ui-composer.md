# Code regression — ui-composer

## Meta

- Paths: `packages/ui/src/app/features/composer/`
- Date: 2026-09-20
- Mode: delta
- Coverage: All 15 product TypeScript files (service, six folds/helpers, six components) plus all seven colocated tests. HITL fold + `execution-hitl-fold.test.ts` read in full (stale-hydrate guard). Permission / ask-user / drafts / footer-mode / payload tests sampled. Cross-checked canvas `applyNodeHitlFrame` only to classify the previous twin finding — not a second audit of that chunk. Templates sampled for footer-mode / HITL tab / Pause / Run remount gates. Not a line-by-line read of every template class.
- Previous report: 2026-09-19 — Critical=1 Important=3 Suggestion=5

## Previous findings (delta mode)

| id                               | severity  | status | evidence                                                                                                                                                                                                                                                                                           |
| -------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-composer-stale-hitl-hydrate` | Critical  | fixed  | LEDGER Closed 2026-09-19. `foldAwaitingHitl` still ignores hydrate when `event.events === state.lastEvents`, and after reset-to-empty when `event.feedRunId === state.lastFeedRunId`. Test `does not restore awaiting ids from a settled feed when palette re-emits` still holds. Must not reopen. |
| `ui-composer-hitl-fold-untested` | Important | fixed  | `packages/ui/src/app/features/composer/tests/execution-hitl-fold.test.ts` now covers hydrate → `runner.done` → palette re-emit → `ids` stay empty. Missing tests is also not a listed class.                                                                                                       |

## Principles check

- **PASS — tagged actions + one `scan` per concern:** drafts, permission asks, `ask_user` asks, composer HITL awaiting, and continue-button checkpoint UI are closed unions reduced immutably. Subjects are intent-only (`draftActions$`, `hitlOpenLocal$`, `hitlResolveLocal$`). No `BehaviorSubject` domain store.
- **PASS — stale hydrate after reset (BUG-2026-09-19b held):** `foldAwaitingHitl` remembers last feed `events` identity + `feedRunId` and ignores same-array / same-`runId` hydrates after `hardReset`. LEDGER `ui-composer-stale-hitl-hydrate` stays closed.
- **PASS — no `withLatestFrom`:** HITL hydrate is `combineLatest([executionFeed, workflow, palette])`. Palette path is `mergedPaletteFromSnapshots$` (real system + custom, no empty custom `startWith`).
- **PASS — no barrels / no `interface`:** no `index.ts`; exported shapes are `type`. Domain payloads come from `@langflower/shared` / `@langflower/node-sdk` / `@langflower/runtime`.
- **PASS — feature-sliced ownership:** HITL / drafts / Pause live on `ComposerService`. WES is not injected by this service as a reverse owner; composer injects WES + feed + bridge (AGENTS.md).
- **PASS — thin server / no UI DTO adapters:** intents go to typed `bridge.raw['runner.*.requested'|event]`. No REST client, no `*Adapter` / `*Mapper`.
- **PASS — composer entry for HITL wiring:** `createHitlTriggeredNodes$` still lists sibling sources (input / output / open / resolve / hydrate / new-run / settle) in one place.
- **PASS — permission / ask_user are fact-only:** both folds remove an ask only on `*.accepted` (tests still say so). Not a second HITL writer.

## FOUND_BUGS signals

- **BUG-2026-09-19b (held, not recurrence):** composer tabs after settle. Guard + `execution-hitl-fold.test.ts` still present. Same-array / same-`runId` hydrate after reset does not restore `ids`.
- **BUG-2026-07-17c:** leftover-tab class; mechanism is the 09-19b hydrate, already fixed. No new leftover path in this slice.
- **BUG-2026-07-30 (held):** permission / `ask_user` pending lists still drop only on `*.accepted`.
- **BUG-2026-07-21b / BUG-2026-09-18:** composer hydrate still waits for feed + workflow + palette together. `\|\| composer.catalog === null` is **not** in this slice. Do not treat the documented live `switchMap` window as a recurrence, and do not invent a canvas-style event store here.
- **BUG-2026-07-17b (held):** remounted Run/Stop still reads `WorkflowExecutionService.hasRunnableGraph()` / `isRunning()` / `hasPaletteCatalog()`, not a component-local `workflow.current.snapshot.pipe(startWith(null))`.

## Glue / adapters / parallel types

none

Residual note (not `twin-without-adr`): composer `computeHitlFromEvents` vs canvas `applyNodeHitlFrame` share `services/hitl-projection.ts` primitives. No mirrored protocol type. No ADR required for two projections. Local UI types (`ComposerFooterMode`, `ComposerDraftsState`, `ASK_USER_TEXTAREA_CONFIG`) are slice-owned.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- **LEDGER `ui-composer-stale-hitl-hydrate`:** re-confirmed; do not reopen without a new mechanism (a hydrate that restores ids from the same feed array / same `runId` after reset).
- Epic 47 self-describing frames: this slice classifies HITL open/close via port id + `hitl-projection` helpers, not a feed-role catalog fallback. No new catalog-store finding.
- No `withLatestFrom`, no `index.ts`, no `interface`, no `any`.
- `mergedPaletteFromSnapshots$` has no empty custom `startWith`.
- `liveness.ts` lives only under composer.
- Drafts fold is small, immutable, and tested (`chatStartPending` vs `runStarted`).
- Footer mode is a pure function with priority tests (permission > askUser > working > hitl > idleRun).
- `nodeInputString` / `resolveComposerActionPayload` are thin Result-style helpers, not glue.
- Continue-button fold reads `bridge.cached['runner.checkpoints.snapshot']` (replay-safe on remount); resume intent carries `runId`.
- `ASK_USER_COMPOSER_PORT_ID` is a local draft key (shell + service consumers), not a mirrored protocol type.
- Feature → `ExecutionFeedService` import matches AGENTS.md.
