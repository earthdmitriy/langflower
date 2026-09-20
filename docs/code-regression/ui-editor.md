# Code regression — ui-editor

## Meta

- Paths: `packages/ui/src/app/features/editor/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full re-read of the same six files as 2026-09-19 (`editor-shell.component.ts`, `clamp-divider-positions.ts`, `ws-server-poke.ts`, plus the three colocated tests). No new files under `editor/`. ts-scan: `inspect` of `composerHost`; `resolve_symbol` for `LangflowerBridgeService`, `EditorPaletteVisibleProjectionService`, `EditorSettingsProjectionService`, `DEFAULT_DIVIDER_POSITIONS`; `list_exports` of clamp + poke. Cross-checked only to reconcile: `langflower-bridge.service.ts` `CACHED_BRIDGE_EVENTS` (includes `editor.dividers.snapshot`), `packages/server/src/bridge/wire-editor-handlers.ts` divider persist (writes `session.dividerPositions`, emits `editor.dividers.snapshot` only), `packages/ui/AGENTS.md`, PRINCIPLES / REACTIVITY / FOUND_BUGS (hydrate-echo / dual-write). LEDGER closed `ui-editor-first-measure-persist` on 2026-09-20; divider two-writers stay open. Not a class-by-class style pass of the template.
- Previous report: 2026-09-19 — Critical=0 Important=3 Suggestion=3 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                | severity  | status     | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-editor-divider-two-writers`   | Important | still-open | Session `effect` still nulls `leftWidth` / `rightWidth` / `composerHeight` on every `session.state.snapshot` (~L348). Constructor `.subscribe` on `cached['editor.dividers.snapshot']` still copies into the same signals (~L372). Drag + `reclampToViewport` still write them. No `EditorDividersProjectionService`. Server persist updates in-memory `session.dividerPositions` and emits `editor.dividers.snapshot` only — cached session slice stays connect-time. |
| `ui-editor-first-measure-persist` | Important | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Principles check

- **PASS — no barrels / `type` not `interface` / arrow helpers:** No `index.ts` under `editor/`. Local shapes are `type` (`ResizeDrag`, `MeasuredLayout`, poke option types). Clamp / poke helpers are arrows. Zero `withLatestFrom`.
- **PASS — compose sibling components at the shell:** Template mounts `lf-palette-sidebar`, `lf-canvas-container`, `lf-inspector-panel`, `lf-settings-panel`, `lf-work-log-panel`, `lf-composer-shell`, `lf-workflow-topbar`, `lf-project-dir`. No ngDiagram imports.
- **PASS — palette chrome ownership stayed on the platform:** `EditorPaletteVisibleProjectionService` is imported from `src/app/services/`.
- **PASS — bridge as source of truth for intents:** Dividers persist via `editor.dividers.requested`; palette restore via `paletteChrome.requestShow()`; settings via `EditorSettingsProjectionService`. No REST / DTO adapters.
- **PASS — domain types reused:** `DividerPositions` and divider mins from `@langflower/shared`. No parallel layout DTO.
- **PASS — inbound divider apply does not echo-persist:** `applyDividerPositions` clamps for display only (BUG-2026-06-26i comment). Persist stays on drag-end and `reclampToViewport(true)`.
- **PASS — HITL / Run chrome left the slice:** No leftover `hitlByNode` / `hitlTabs` / run-gate fold.
- **FAIL — `two-writers`:** Displayed divider sizes have several writers of one concern (session wipe `effect`, constructor snapshot `.subscribe`, drag / `reclampToViewport`). Sibling chrome (palette / settings) already uses `merge(session field, live snapshot)`.
- **PASS — first-measure persist floor:** Divider persist only after non-zero row/aside measure (LEDGER `ui-editor-first-measure-persist`, 2026-09-20). Remaining divider concern is display two-writers, not the 0-width echo.
- **N/A — thin server / composer entry points:** UI chrome only.

## FOUND_BUGS signals

- **BUG-2026-06-26i / BUG-2026-07-20** (init/lifecycle echo treated as user mutation) — **outbound persist floor shipped 2026-09-20.** Inbound `applyDividerPositions` still honors the lesson. Persist now requires non-zero row/aside measure. Remaining open item is display two-writers (`ui-editor-divider-two-writers`), not a 0-width echo.
- **BUG-2026-07-22c** (editor ↔ session dual-write of topology) — **does not recur here.** Divider chrome dual writers are `two-writers`, not a topology `session.activeWorkflow` miss.
- **BUG-2026-07-17b** (remounted Run/Stop / non-replaying Subject) — **not this chunk.** `lf-run-button` / `lf-continue-button` live under `features/composer/`.
- **BUG-2026-07-16** (eager snapshot `.subscribe` / circular load) — low direct risk; divider sub is `takeUntilDestroyed`.
- **BUG-2026-07-21b** (false-ready `withLatestFrom`) — none in this chunk.
- Canvas chrome / port-staleness (BUG-2026-07-11 family, BUG-2026-07-21e, BUG-2026-08-18c) — ownership is `canvas/`, not this chunk.

Historical leftover check (SUMMARY D / AE): `EditorPaletteVisibleProjectionService` remains in `app/services/`; `#composerHost` + `viewChild` replaced `aside.lastElementChild`; `reloadPage` is private; composer handle aria-label is “Resize composer panel”; HITL/Run symbols are absent from `features/editor/`.

## Glue / adapters / parallel types

none

ADR-backed copies: none in this chunk. `DividerPositions` is the shared owner type. Sibling palette / settings projections live in `app/services/` and are not type mirrors.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

1.  - id: `ui-editor-divider-two-writers`

- class: two-writers
- severity: Important
- first-seen: 2026-09-19
- status: open
- path: `packages/ui/src/app/features/editor/components/editor-shell.component.ts` — `sessionSnapshot` `effect` (~L348), `editor.dividers.snapshot` `.subscribe` (~L372), `leftWidth` / `rightWidth` / `composerHeight`
- evidence: One divider concern, several writers. The session `effect` nulls overrides on every snapshot emission; the constructor subscribe copies the live cached snapshot into the same signals; drag / `reclampToViewport` write them again. `cached` is eager `shareReplay(1)`, so remount subscribe applies live sizes in the constructor, then the later `effect` wipes them. Template falls back to `sessionSnapshot.dividerPositions`. Server `editor.dividers.requested` writes `session.dividerPositions` and emits `editor.dividers.snapshot` only — it does not rebroadcast `session.state.snapshot` — so a remount without reconnect can paint stale connect-time sizes. Sibling chrome already merges bootstrap + live in `EditorPaletteVisibleProjectionService` / `EditorSettingsProjectionService`.
- proposed fix: One tagged-action fold or remount-safe `EditorDividersProjectionService` (`merge` session field + live snapshot + drag/viewport). Delete the wipe `effect` and the subscribe-copy.

## Non-issues / looked OK

- **LEDGER:** no ui-editor Closed/Wontfix rows; nothing to reopen.
- **Historical leftover cluster (D / AE) stayed deleted:** palette-visible service in `app/services/`; `#composerHost` not `lastElementChild`; `reloadPage` private; aria-label “Resize composer panel”; no HITL/Run symbols under `features/editor/`.
- Compose-only boundary for sibling _components_ still holds.
- No `withLatestFrom`, no barrel `index.ts`, no `interface`, no `BehaviorSubject` domain cache in product files (tests use Subjects as allowed sources).
- Clamp math is pure, has unit tests for the visible-palette case, and matches `DIAGRAM_CANVAS.md` mins / `w-1` / `h-1` gutters. Hidden-palette budget miss is not a listed class.
- `startWsServerPoke` is a legitimate disconnect host edge (probe `/ws`, reload once); tests cover in-flight / stop / single `onReachable`. Constructor / close `catch` is retry/cleanup, not `fail-open-io`.
- Theme / settings / hover / resize-drag signals are allowed UI-only local state.
- Constructor warm of config / models-catalog projections is documented and not a parallel config cache.
- `OnPush` standalone shell; `paletteVisible$` via `async` pipe (no `toSignal(..., { initialValue: null })` default).
- `composerHost` `ElementRef<any>` and `lastSessionLeftWidth = 280` remain; deliberately not findings.
- Shell tests still only cover palette chrome; missing divider sequences are not a class.
