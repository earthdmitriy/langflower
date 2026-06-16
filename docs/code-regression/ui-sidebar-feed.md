# Code regression — ui-sidebar-feed

## Meta

- Paths: `packages/ui/src/app/features/sidebar/`
- Date: 2026-07-22
- Coverage: Full file inventory (16 files). Deep-read: `feed-section.ts`, `feed-timeline.ts`, `format-port-value.ts`, `utils/settings-draft.ts`, all five components under `components/`. Spot-checked tests (`feed-section`, `feed-timeline`, `lf-work-log-panel`, `settings-draft`) and `spec.md` for drift. RxJS feed fold wiring reviewed in `packages/ui/src/app/services/execution-feed-fold.ts` as consumer contract only. Preview scan reviewed in `packages/ui/src/app/features/canvas/services/node-preview-values.service.ts` (consumed by work-log). No `withLatestFrom` in this tree (only anti-pattern mention in `spec.md`).

## Principles check

- **PASS — no barrels** — no `index.ts` under `sidebar/`; concrete imports only.
- **PASS — `type` not `interface`** — local shapes use `type` + `readonly`.
- **PASS — immutability in feed folds** — `foldOutputEvent` / `foldUserTurn` / `settleActiveSection` return new state; `Map` copies on trim; no in-place section mutation.
- **PASS — one concern, pure fold colocated** — feed section/user-turn fold lives in `feed-section.ts`; chat-density projection in `feed-timeline.ts`; service wiring in `execution-feed-fold.ts` imports feature-owned pure functions (allowed platform→feature vocabulary import).
- **PASS — no `withLatestFrom`** — sidebar product code clean; service fold gates snapshot hydrate on `combineLatest([executionFeed, workflow, palette])` (BUG-2026-07-21b fix direction).
- **PASS — preview scan (consumed)** — `NodePreviewValuesService` uses `merge` → tagged actions → `scan` → `toSignal`; no false-ready `startWith(empty)` pairing. Work-log reads via `entriesForNode` at presentation edge only.
- **PASS — Clear gated while running** — `lf-work-log-panel` hides Clear when `isRunning()` (BUG-2026-07-17).
- **PASS — arrow functions** — `feed-section.ts`, `feed-timeline.ts`, `format-port-value.ts`, inspector helpers use `const … = () =>`.
- **PASS — domain types reused** — `FeedRole` from `@langflower/node-sdk`; inspector uses `UISchemaConstItem` (cast remains — see Findings).
- **PASS — inspector models catalog** — `merge` refresh-start + snapshot → `scan` → `toSignal`; bridge request stays in `effect` edge.
- **PASS — expand/collapse UI-only** — `detailReopenOverride` in work-log; no hydrate from run gate (live/reconnect parity for technical blocks).
- **FAIL — feature slice boundaries (partial)** — sidebar reaches into `features/canvas/` for `LfInlineFieldComponent` and `NodePreviewValuesService` (see Findings #1–2). Compose at editor/platform layer or promote shared primitives.

## FOUND_BUGS signals

- **BUG-2026-07-21b** (false-ready hydrate) — **not present in this chunk**. Pure folds only; recurrence risk stays in service wiring — keep `combineLatest` on real catalog Subjects, not ad-hoc `startWith(empty)` in sidebar streams.
- **BUG-2026-07-17** (Clear mid-run) — **mitigated** in `lf-work-log-panel.component.ts` (`@if (!isRunning())` around Clear).
- **BUG-2026-07-17c** (orphan HITL after `done`) — awaiting fold is service-owned; HITL components read `hitlDraft` / emit submit via actions only — no local awaiting cache.
- **BUG-2026-07-21** (live settle vs reconnect chrome fork) — timeline projection is shared pure path; expand state is UI-only — good for collapsed technical block parity.
- **BUG-2026-07-12c** (output before input order) — fold trusts event order; presentation cannot fix protocol ordering — no new flaw here.
- **BUG-2026-07-21d** (passthrough demand) — upstream echo suppression in `feed-timeline.ts` aligns with HITL `preview`/`prompt` port ids; no sidebar recurrence of dropped demand.

## Glue / adapters / parallel types

- **No `*Adapter` / `*Mapper` classes** in this chunk.
- **Presentation-only types OK** — `FeedSection`, `FeedUserTurn`, `FeedTimelineRow*`, `SettingsDraft` / `ProviderDraft` are UI fold/form shapes, not protocol DTOs.
- **Boundary glue (acceptable)** — `configToDraft` / `draftToSavePayload` map write-only apiKey hygiene; not a hidden second config model.
- **Port-name fallback** — `effectiveFeedRole` in `feed-section.ts` fills missing palette `feed.role` from known port ids (`reasoning`, `draftResponse`, `response`); documented last-resort, not a parallel protocol type.
- **Residual cast** — `panelUiSchema` still casts `definition.uiSchema as readonly UISchemaConstItem[]` until `PaletteNodeDefinition.uiSchema` is typed (shared with palette twin smell).
- **ADR-backed adapters:** none in this chunk.

## Streamlining & simplifications

- Promote `NodePreviewValuesService` to `src/app/services/` (or expose inputs via `WorkflowExecutionService` selector) so sidebar stops importing `features/canvas/services/`.
- Move `LfInlineFieldComponent` to `src/app/components/` (or inject via editor composition) so inspector does not import canvas feature components.
- Rewrite or trim `spec.md` § Executive Summary — still claims HITL controls are missing (Suggestion).
- Migrate HITL `@Input` / `@Output` to `input()` / `output()` when touching those files (optional consistency).
- Remove dead `@Output() submitted` on `lf-hitl-textarea` (editor binds it; submit path is `lf-hitl-actions` only).
- Replace `sameDraft` `JSON.stringify` with field-wise compare if draft shape grows (currently fine for controlled drafts).

## Design-flaw fixes

1. ~~**Dead “default expanded” policy**~~ — **addressed (verified 2026-07-22)** — projection knobs deleted; expand is UI-only via `detailReopenOverride`.
2. ~~**Text-equality echo suppression**~~ — **addressed (verified 2026-07-22)** — user echo prefers HITL `portId` match; upstream echo gated to `feed.role: 'none'` / passthrough port ids; formatted-text equality is named last-resort fallback only.
3. ~~**Inspector models refresh as subscribe→signal**~~ — **addressed (verified 2026-07-22)** — `scan` + `toSignal` over snapshot + refresh-start intents.
4. ~~**Parallel `FeedRole` union**~~ — **addressed (verified 2026-07-22)** — re-export from `@langflower/node-sdk`.
5. **Cross-feature canvas imports** — **open** — sidebar should not own imports into canvas slice (Findings #1–2).

## Findings

1. **Severity:** Important  
   **Status:** open  
   **Path / symbol:** `components/lf-inspector-panel.component.ts` — import `LfInlineFieldComponent` from `../../canvas/components/`  
   **Problem:** Violates `packages/ui/AGENTS.md` — a feature must not import another feature's components; sibling features compose at editor/root boundary only.  
   **Fix:** Move inline-field to shared `src/app/components/`, or compose inspector rows without reaching into canvas internals.

2. **Severity:** Important  
   **Status:** open  
   **Path / symbol:** `components/lf-work-log-panel.component.ts` — inject `NodePreviewValuesService` from `../../canvas/services/`  
   **Problem:** Preview-value fold is cross-feature (canvas inline ports + work-log technical Inputs). Service is `providedIn: 'root'` but file-owned by canvas slice — sidebar reaches upward into a sibling feature for platform concern.  
   **Fix:** Promote `NodePreviewValuesService` to `src/app/services/` (or add a platform selector on `WorkflowExecutionService` / dedicated projection module) and import from platform layer.

3. **Severity:** Important  
   **Status:** deferred (palette typing)  
   **Path / symbol:** `components/lf-inspector-panel.component.ts` — `panelUiSchema` cast (~L253–256)  
   **Problem:** Unsafe `as readonly UISchemaConstItem[]` until `PaletteNodeDefinition.uiSchema` is typed at source.  
   **Fix:** Type `uiSchema` on shared palette definition; drop cast here and in palette projection.

4. **Severity:** Suggestion  
   **Status:** deferred  
   **Path / symbol:** `spec.md` § Executive Summary (~L5–14)  
   **Problem:** Still states HITL feed controls are missing; code ships `lf-hitl-textarea`, `lf-hitl-actions`, nested replies in timeline.  
   **Fix:** Rewrite as historical note or delete obsolete problem statement.

5. **Severity:** Suggestion  
   **Status:** deferred  
   **Path / symbol:** `components/lf-hitl-actions.component.ts`, `lf-hitl-textarea.component.ts` — `@Input` / `@Output` + `EventEmitter`  
   **Problem:** Rest of sidebar uses Angular signal APIs; HITL controls still classic inputs/outputs.  
   **Fix:** Migrate to `input()` / `output()` when touching these files.

6. **Severity:** Suggestion  
   **Status:** deferred  
   **Path / symbol:** `components/lf-hitl-textarea.component.ts` — `@Output() submitted` (~L59–61)  
   **Problem:** Output is bound in `editor-shell.component.ts` but never emitted; submit flows through `lf-hitl-actions` only — dead API surface.  
   **Fix:** Remove `@Output submitted` and editor bindings, or wire Enter-to-submit through the output.

7. **Severity:** Suggestion  
   **Status:** deferred  
   **Path / symbol:** `utils/settings-draft.ts` — `sameDraft` (~L134–135)  
   **Problem:** Dirty check via `JSON.stringify` (key-order / undefined sensitivity). Fine for current controlled drafts; brittle if draft shape grows.  
   **Fix:** Field-wise compare or document stable key order invariant.

## Non-issues / looked OK

- Pure immutable feed fold (`trimStaleRun`, string-chunk concat, optimistic `local:` user-turn dedupe, `anchorSectionId` nesting).
- `projectFeedTimeline` chat-density rules (technical grouping, nested HITL replies, upstream echo suppression with structural gates first).
- Work-log bridge usage: reads `WorkflowExecutionService` signals; Clear intent only; hover linkage via `NodeHoverService`.
- Settings draft hygiene (`draftAfterLayerSnapshot` write-only apiKey) + bridge `langflower.config.save.requested`.
- No `BehaviorSubject` domain caches; no REST; no `index.ts`.
- HITL actions/textarea: drafts owned by execution service; no parallel awaiting set in the sidebar.
- Auto-scroll / stream-pane `effect`s are DOM edges (acceptable); expand override map is UI-only.
- `formatPortValue` shared between work-log and inspector (`readonly formatValue = formatPortValue`).
- Service feed fold (`execution-feed-fold.ts`): `combineLatest` snapshot gate, `switchMap` live paths on catalog churn, single `scan(foldFeedState)` — aligns with REACTIVITY canonical flow.

**Return Status:** Critical=0 Important=2 Suggestion=4
