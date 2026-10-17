# Code regression — ui-feed

## Meta

- Paths: `packages/ui/src/app/features/feed/`, `packages/ui/src/app/features/feed-folding/`
- Date: 2026-09-20
- Mode: delta
- Coverage: All production files in both slices (panel / row / collapsible, window / pin / presentation helpers, `fold-port-events.ts` composer, `execution-feed.service.ts`, `types.ts`, operators, recovery helpers, README). Sampled replay / inputs / visits / fixture `outputEvent` stamping. Cross-checked the only production `nodeFeed$` consumer (`features/composer/composer.service.ts` `latestFeedNodeId` / `workingSteerNodeIds`). ts-scan on `latestRecoveryItem`, `isLatestRecoveryRow`, `liveRecoveryTail`, `projectNodeFeed`, `nodeFeed$`, `frameFeedRole`, `feedWindowShowsHead`, `resolveOutputFeedRole` (absent). Not a line-by-line audit of every fixture case.
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=3

## Previous findings (delta mode)

| id                             | severity  | status | evidence                        |
| ------------------------------ | --------- | ------ | ------------------------------- |
| `ui-feed-latest-recovery-item` | Important | fixed  | Closed 2026-09-20 — see LEDGER. |

## Principles check

- **PASS — one append-only feed fold.** `fold-port-events.ts` `composeFeedProjection` is tagged actions → `merge` → `scan(foldComposer)` → selectors (`projectNodeFeed` / `projectFeedRows`). Live frames call `appendFeedFrame`; full replay only on snapshot / clear / new `runId` (pending flush). Matches `feed-folding/README.md` and PRINCIPLES § Standard flow.
- **PASS — no `withLatestFrom`; no catalog role fallback.** Catalog is `combineLatest(workflow, palette+custom)` with no `startWith(empty)`. Role / streaming / `closesPreviousVisit` come from `frame-feed-meta.ts` (`event[6]`). `resolveOutputFeedRole` is gone (ts-scan miss). Composer `entries` / `rebuildProjection` are gone; `pending` buffers only while `runId === null`. Empty-map `catalog ?? {…}` in `appendEntry` is a dummy for already-tagged permission / ask-user entries, not a palette role lookup.
- **PASS — self-describing `'in'` frames (BUG-2026-09-20 held).** `frameMeta` uses `frameFeedRole(event)` only. HITL still uses palette for `hitlReplyReceived` copy, not for role. Regression: `execution-feed.service-inputs.test.ts` `renders an input frame that declares feed result` with an empty palette.
- **PASS — feature split, no barrels, `type` not `interface`.** `feed-folding/` owns projection; `feed/` owns window + row chrome. No `index.ts`. Public shapes are `type`. No `withLatestFrom` in either slice.
- **PASS — domain types reused.** `RuntimeFeedRole` from `@langflower/runtime`; control-plane presentations are feature vocabulary. Fixture `outputEvent` may default common _output_ port names onto slot 6; that is test sugar, not a production catalog fallback (inputs stay `options.feed ?? null`).
- **PASS — immutability in the fold.** Composer / `appendFeedFrame` / `foldPortStream` copy Maps and arrays.
- **PASS — Clear is not a mid-run wipe.** `lf-work-log-panel.component.ts` hides Clear when `execution.isRunning()`; intent is `runner.executionFeed.clear.requested`.
- **PASS — dead recovery helpers.** `latestRecoveryItem` / `isLatestRecoveryRow` deleted; `liveRecoveryTail` stays (LEDGER `ui-feed-latest-recovery-item`, 2026-09-20).

## FOUND_BUGS signals

- **BUG-2026-09-20 (SDK input `feed` / catalog fallback)** — **no recurrence.** Production fold reads slot 6 only. Recurrence would be a palette lookup that invents a role for `'in'` frames when slot 6 is null; that path is absent. Held by `renders an input frame that declares feed result` and `omits unmarked ports when the event feed slot is null`.
- **BUG-2026-07-21b (false-ready catalog)** — still mitigated. `combineLatest` waits for real workflow + palette Subjects. Replay test: `retains an early bridge snapshot until workflow and palette arrive` (now held by `combineLatest`, not an `entries` rebuild). Live ports before `runner.started` still flush from `pending` (`execution-feed.service-lifecycle.test.ts`).
- **BUG-2026-07-23b (null snapshot identity)** — still honored. Every `executionFeed.snapshot` emission becomes `snapshot` / `clear`; `distinctUntilChanged` compares snapshot identity, not `null === null`. Replay test: `replaces history from snapshots and clears it on null`.
- **BUG-2026-07-17 (Clear during run)** — still honored in the panel (`!execution.isRunning()`).
- **BUG-2026-08-18 (Sub-Agent visit close)** — still `frameClosesPreviousVisit` / `withClosesPreviousVisit`, not a toolLog regex.
- **BUG-2026-08-18b / pending-null drop** — `normalizePortFrame` still drops `'pending'` / `'inactive'`.
- **BUG-2026-07-21 (grok-feed chronology)** — `flattenFeedRows` stays first-seen visit order + chronological segments.
- **BUG-2026-09-18 / BUG-2026-07-21 live-vs-reconnect chrome** — canvas / WES, not this fold.

## Glue / adapters / parallel types

none

Residual notes (not `twin-without-adr`): local `RolePresentation` alias; unused `tool-request` / `tool-response` union members still documented in README § Port-item fold; `nodeFeed$` vs `feedRows$` are two selectors over one projection. No `*Adapter` / `*Mapper`. Historical dual-fold files stay absent. WES inject on panel/row is the allowed platform façade (`isRunning` / `nodeLabel` / `livenessNowMs`).

## Streamlining & simplifications

none

(`latestRecoveryItem` / `isLatestRecoveryRow` deleted 2026-09-20. `liveRecoveryTail` stays.)

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- **Catalog fallback / `resolveOutputFeedRole` / `entries` / `rebuildProjection` stayed deleted.** No recurrence on `'in'` frames. Palette is still used for HITL reply copy (`hitlReplyReceived`) and document-switch keys, not for feed role.
- **`ui-feed-parallel-nodefeed`** — composer is a real consumer; nested `pinnedRecovery` / `foldedEventsFromPorts` Observables are selector cost, not a second fold.
- **`ui-feed-tool-interaction-protocol`**, template dupes, WES label, `RolePresentation` / `feedWindowShowsHead` — leftover or tidy-up, not listed classes.
- **Historical dual-fold leftovers stay deleted.** No `execution-feed-fold` / `createFeedState$` / `feed-section` / `feed-timeline` / `workflow-execution.service.test.ts` under `packages/ui`.
- **One production timeline:** `ExecutionFeedService` → `lf-work-log-panel` `toSignal(feedRows$)` + window `effect`. Window/pin/measure state is local UI (ADR-037).
- **No canvas/sidebar leak.** No `NodePreviewValuesService` / `LfInlineField` / `features/canvas/` / `features/sidebar/` imports. Hover uses platform `NodeHoverService`.
- LEDGER Closed 2026-09-20: `ui-feed-latest-recovery-item`. Do not reopen without a new mechanism.
- No `withLatestFrom`, no `index.ts` barrels, no `interface` in production files of this chunk.
