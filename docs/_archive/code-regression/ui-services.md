# Code regression — ui-services

## Meta

- Paths: `packages/ui/src/app/services/`
- Date: 2026-09-20
- Mode: delta
- Coverage: All 20 production modules (previous 19 plus `frame-feed-meta.ts`). Re-read WES, live-graph / run-gate / chrome / liveness / output-values folds, catalog, chat-entry, HITL projection, bridge client, remount projections, theme, hover. Sampled tests: chrome, run-gate, catalog, output-values, live-graph, hitl-projection. Cross-checked `hasRunnableGraph` / `lastActivityMs` / `requestScope` callers via ts-scan. No `execution-liveness-fold.test.ts`. Not a line-by-line pass of every fixture.
- Previous report: 2026-09-19, Critical=0 Important=2 Suggestion=6 (unstructured ids; ids assigned in this delta)

## Previous findings (delta mode)

| id                                          | severity   | status     | evidence                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-services-run-gate-snapshot-graph`       | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                     |
| `ui-services-liveness-started-wipe`         | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                     |
| `ui-services-config-layers-twin`            | Suggestion | still-open | `LangflowerConfigLayersProjection` is still a field-for-field copy of imported `LangflowerConfigSnapshotPayload` (`config`, `projectConfig`, `globalConfig`, `globalPath`, `secretIds`, `secretsPath`). Not in ADR-039. Refs only inside `langflower-config-projection.service.ts`.                 |
| `ui-services-chrome-generic-telemetry-twin` | Suggestion | still-open | Local `OutputPortTelemetry` in `execution-liveness-fold.ts` still duplicates the chrome export (`PortTelemetry & { readonly 0: 'out' }`). `execution-output-values-fold.ts` already imports the chrome alias. Generic `ChromeKeying<K>` with one keying is not a class (dropped from this finding). |

## Principles check

- **PASS — `withLatestFrom` / barrels / `type` not `interface` / no production `any`:** Zero `withLatestFrom` (ts-scan unresolved in this folder). Zero `index.ts`. Zero `interface`. Test-only `wireType: 'any'` strings are palette fixtures, not TypeScript `any`.
- **PASS — tagged-action `scan` folds:** Chrome, run-gate, live-graph, liveness, output-values still follow source → action → `merge` → `scan` → selector. WES has no constructor and no domain `.subscribe`.
- **PASS — leftover dual work-log / HITL APIs stay deleted:** No `createFeedState$` / `execution-feed-fold.ts`. HITL / permission / drafts stay in `features/composer/`. Cited `workflow-execution.service.test.ts` is still gone.
- **PASS — custom-catalog false-ready on WES gates:** `mergedPaletteFromSnapshots$` is still `combineLatest([system$, custom$])` with no empty custom `startWith`. `hasPaletteCatalog` / `hasPlainStartTargets` still refuse while `palette.size === 0`.
- **PASS — one-way diagram conversion / no feature-component import:** `bridge-diagram.ts` (not `*.service.ts`). `LfNodeData` colocated. Canvas helper import only. No import from `lf-node.component`.
- **PASS — bridge as SoT:** `LangflowerBridgeService` is `createClient` + eager `shareReplay(1)` cache. No REST / DTO adapters. `BehaviorSubject` only in `ThemeService` (UI-only theme).
- **PASS — null active workflow (BUG-2026-07-17d):** `nodeTypeByIdFromWorkflow` and `createLiveGraph$` still use `activeWorkflow?.graph ?? null`.
- **PASS — Run enablement one graph fact:** `hasRunnableGraph` reads `activeGraph()?.nodes.length` (LEDGER `ui-services-run-gate-snapshot-graph`, 2026-09-20).
- **PASS — liveness adopt/keep `runId`:** `started` no longer hard-wipes same-run stamps (LEDGER `ui-services-liveness-started-wipe`, 2026-09-20).
- **FAIL — `twin-without-adr`:** `LangflowerConfigLayersProjection` and liveness-local `OutputPortTelemetry`. See those two Suggestion ids.
- **N/A — thin server.**

## FOUND_BUGS signals

- **BUG-2026-08-18d (started-after-ports wipe):** **Liveness now adopt/keep `runId` (2026-09-20).** Chrome / HITL / feed already did. Reconnect order is still `executionFeed.snapshot` then replayed `runner.started` (UI `AGENTS.md`).
- **BUG-2026-07-11c (frozen `graphInput` vs live edges):** **Does not recur on Run size.** Run gate now uses `activeGraph`. That bug was port rebuild from a frozen canvas `graphInput`.
- **BUG-2026-07-17b (remount enablement):** Remount via root `toSignal` still held. Run size now follows `activeGraph`.
- **BUG-2026-07-21b (false-ready empty maps):** No `withLatestFrom` here. WES custom empty seed stayed deleted. Residual empty custom `startWith` is palette sidebar (out of chunk).
- **BUG-2026-07-21 (settle wipe):** Chrome still omits done/interrupt wipe. Looked held.
- **BUG-2026-07-16 (eager `runner.snapshot` / NG0200):** Still closed on WES. Models-catalog constructor subscribe is not that mechanism.
- **BUG-2026-07-17d (null graph):** Looked held.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes.** No parallel WS payload types.
- **`bridge-diagram.ts`:** Allowed one-way persisted → ng-diagram boundary.
- **`FeedCatalog` / `feedCatalogFromSnaps`:** Shared by feed-folding and canvas-node-status. Platform owner is correct.
- **`HitlControlProjection`:** Cross-feature vocabulary. OK.
- **`frame-feed-meta.ts`:** New since the previous module list. Shared `PortTelemetry` slot-6 readers for feed / HITL / canvas chrome. Not a twin.
- **`LangflowerConfigLayersProjection`:** Twin of `LangflowerConfigSnapshotPayload`. Finding `ui-services-config-layers-twin`.
- **Liveness-local `OutputPortTelemetry`:** Twin of the chrome export. Finding `ui-services-chrome-generic-telemetry-twin`.
- **Composer snapshot `nodeTypeById$`:** Out of chunk (`composer.service.ts`). HITL classify on snapshots is the right readiness model.

## Streamlining & simplifications

- `langflower-config-projection.service.ts`: `type LangflowerConfigLayersProjection = LangflowerConfigSnapshotPayload` (or use the payload type directly).
- `execution-liveness-fold.ts`: import `OutputPortTelemetry` from `execution-chrome-fold.ts`; delete the local alias.

(`hasRunnableGraph` from `activeGraph` shipped 2026-09-20.)

## Design-flaw fixes

none

## Findings

1.  - id: `ui-services-config-layers-twin`
    - class: `twin-without-adr`
    - severity: Suggestion
    - first-seen: 2026-09-19
    - status: open
    - path: `packages/ui/src/app/services/langflower-config-projection.service.ts` — `LangflowerConfigLayersProjection`
    - evidence: Local type duplicates `LangflowerConfigSnapshotPayload` field-for-field. Already imported in the same file. Not listed in ADR-039. No parity test. ts-scan: declaration + `EMPTY_LAYERS` + `scan` only.
    - proposed fix: Use `LangflowerConfigSnapshotPayload` (or `type LangflowerConfigLayersProjection = LangflowerConfigSnapshotPayload`).

2.  - id: `ui-services-chrome-generic-telemetry-twin`
    - class: `twin-without-adr`
    - severity: Suggestion
    - first-seen: 2026-09-19
    - status: open
    - path: `packages/ui/src/app/services/execution-liveness-fold.ts` — local `OutputPortTelemetry`
    - evidence: Line 7 redeclares `PortTelemetry & { readonly 0: 'out' }`. Chrome already exports that alias; output-values fold imports it. Not an ADR-039 twin.
    - proposed fix: Import `OutputPortTelemetry` from `execution-chrome-fold.ts`; delete the local type.

## Non-issues / looked OK

- **LEDGER Closed 2026-09-20:** `ui-services-run-gate-snapshot-graph`, `ui-services-liveness-started-wipe`. Do not reopen without a new mechanism.
- **Cluster close — WES constructor `.subscribe` for drafts:** still false. No constructor; Composer owns drafts / Pause / HITL tabs.
- **Cluster close — `withLatestFrom`:** none in this folder.
- **Cluster close — competing work-log `scan`:** one timeline in `feed-folding/`.
- **Follow-up E — empty custom `startWith` on WES:** stayed deleted. `execution-catalog.test.ts` still waits for both snapshots.
- **Follow-up D — `LfNodeData` from `lf-node.component`:** stayed deleted.
- `frame-feed-meta.ts` — new shared slot-6 helpers; consumers in feed-folding / composer HITL / canvas-node-status. Not a twin.
- `langflower-bridge.service.ts` — thin client; eager cache subscribe is the remount host edge.
- Remount projections — snapshot replace + `shareReplay`. Settings/palette intents go to `*.requested`. `startWith(CLOSED_PROJECT)` / `EMPTY_SNAPSHOT` / `EMPTY_LAYERS` are remount seeds, not catalog false-ready.
- `execution-live-graph-fold.ts` — snapshot replace + editor add/update/delete; tests cover update-after-snapshot, replace, add/remove, null graph.
- `execution-chrome-fold.ts` — settled chrome kept; bypass `symbol` portId skipped; adopt-runId covered.
- `chat-entry-clusters.ts` — union-find on a local `parent` map; unknown-type false-ready still gated by WES `palette.size === 0`.
- `hitl-projection.ts` — type predicate, no `as HitlInputConfig`; steer payload-aware transition.
- `node-hover.service.ts` / `theme.service.ts` — UI-only.
- `getEventsForEdge` / `getEventsForPort` / `getInputEventsForPort` — live filters for canvas pulse; not a second fold.
- Snapshot label lag, catalog constructor subscribe, last-output reset policy, and duplicate settings intent names are not listed classes.
