# Code regression — ui-rest

## Meta

- Paths: `packages/ui/src/app/` excluding `features/editor/`, `features/sidebar/`, and `app/services/` (includes `features/canvas/` + its feature services, `features/palette/`, `features/topbar/`, `diagram/`, `components/`, app shell)
- Date: 2026-07-22
- Coverage: Full re-read of `flow-canvas.component.ts`, `lf-canvas-container.component.ts`, `node-preview-values.service.ts`, `lf-node.component.ts`, `lf-edge-chrome.component.ts`, `workflow-topbar.component.ts` + projection, `palette-sidebar.component.ts` (header + effect), `palette-projection.ts`, `palette-drag-image.ts`, `palette-node-preview.component.ts`, `palette-drag-preview.component.ts`, `diagram-port-id.ts`, `resolve-diagram-node-ports.ts` (header + export), `canvas-viewport-sync.ts`, `lf-inline-field.component.ts`, `app.component.ts` / `app.config.ts` / `app.routes.ts`, `lf-hover-tip.component.ts`, `project-dir.component.ts`. Skimmed remaining canvas utils/tests and palette popover. Not a line-by-line audit of every template/CSS string.

## Principles check

- **PASS — no barrels / no `interface` / no `withLatestFrom`:** No `index.ts` under in-chunk paths. Local shapes use `type`. Zero production `withLatestFrom` (only a doc mention in excluded `features/sidebar/spec.md`).
- **PASS — bridge as source of truth:** Canvas/topbar/palette/project-dir send typed `*.requested` intents and project snapshots/deltas; no REST/DTO clients in-chunk.
- **PASS — live port derivation (BUG-2026-07-11c):** `LfNodeComponent` / `resolveNodePorts` read `NgDiagramModelService.edges()` — not frozen `graphInput().edges`.
- **PASS — chrome projection ownership:** Node/edge steady chrome from `WorkflowExecutionService` signals; pulse from per-element event slices — matches BUG-2026-07-15b fix direction.
- **PASS — back-edge routing:** `registerRouting` + auto mode; explicit ban on baking `routingMode: 'manual'` (`flow-canvas` `handleDiagramInit`, `lf-edge-chrome` docs) — BUG-2026-07-21e.
- **PASS — topbar snapshot fold:** `merge` + `scan` over list/current/status snapshots (`workflow-topbar.component.ts`) — no command-reply correlation.
- **PASS — viewport hydrate + palette reseed (2026-07-22 fixes):** Container remounts `lf-flow-canvas` via `@for` track on `activeWorkflow.workflowId`; `hydrateConsumed` resets on seed `graphInput` identity change; `modelAdapter` tracks only `graphInput()` with `untracked` palette seed + `applyPalettePortsToLiveNodes` on subsequent palette snapshots (BUG-2026-07-20 / BUG-2026-06-26i / BUG-2026-07-22a).
- **PASS — preview values fold:** `NodePreviewValuesService` uses `merge` + `scan` + `toSignal` with feed snapshot hydrate, run/workflow clears (BUG-2026-07-15b preview gap addressed).
- **FAIL — feature-sliced import direction:** `features/palette/` imports `features/canvas/` components; `features/canvas/` imports `features/palette/` drag utils — sibling cross-import (see finding #1).
- **FAIL — arrow-function norm:** Exported/local helpers still use `function` declarations (`canvas-viewport-sync.ts`, `palette-projection.ts`, `workflow-topbar-projection.ts`, `resolve-diagram-node-ports.ts`, `palette-drag-image.ts`, inline-field markdown helpers). Style gate, not runtime.
- **PARTIAL — subscribe edges:** Canvas constructor `.subscribe` edges use `takeUntilDestroyed` and are imperative host edges (viewport publish, diagram deltas, selection) — acceptable per REACTIVITY. Pulse paths still use `.subscribe` + `setTimeout` (timer cleared on destroy — see finding #6). Local `combineLatest([single])` helper is noise (finding #4).
- **N/A — thin server / composer entry points:** UI only. Edge-draw/paste handlers document ordered strip→intent steps locally (good local composer comments).

## FOUND_BUGS signals

- **BUG-2026-07-20 / BUG-2026-06-26i** (lifecycle echo / hydrate treated as mutation) — **addressed 2026-07-22** (remount per workflow id + reset `hydrateConsumed` on seed graph identity change). Re-verified in `lf-canvas-container.component.ts` + `flow-canvas.component.ts`.
- **BUG-2026-07-22a** (palette refresh wiped live canvas model) — **addressed 2026-07-22** (`untracked` palette in `modelAdapter`; live `portsConfig` patch). Re-verified; unit `flow-canvas.component.test.ts` (`keeps modelAdapter identity when only palette changes`).
- **BUG-2026-07-11c** (frozen `graphInput` for live topology) — **mitigated in-chunk** for ports (live edges); `graphInput()` still correctly documented as seed-only for viewport hydrate compare.
- **BUG-2026-07-15b** (reduce once, project per element; preview hydrate) — **addressed in-chunk** for wire/node status and preview values via `NodePreviewValuesService` scan.
- **BUG-2026-07-21e** (manual routing freezes back-edges) — **looked fixed** (`registerRouting` + stuck-manual scrub on init).
- **BUG-2026-07-20** (palette drag ghost viewport-wide) — **looked fixed** (`inline-block` / `max-content` in `palette-drag-image.ts`).
- **BUG-2026-06-26** (`fromOutputPortId` slice length) — **looked fixed** (`slice(3)` / `slice(4)` in `diagram-port-id.ts`; bypass handles re-export `@langflower/runtime` helpers — BUG-2026-07-22b alignment).
- **BUG-2026-07-21b** (`withLatestFrom` false-ready) — **none** in this chunk.

## Glue / adapters / parallel types

- **`modelAdapter` name** — ng-diagram `initializeModel` host binding, not a DTO `*Adapter` shim. OK naming collision with principle vocabulary.
- **Boundary mappers live in excluded `app/services/bridge-diagram.service.ts`** (`persistedNodeToDiagram` / `persistedEdgeToDiagram`) — one-way Runtime→diagram; in-chunk consumers call them at intent/delta edges only.
- **No parallel domain graph types** in topbar/palette projections — UI fold state (`WorkflowTopbarState`, `PaletteSidebarState`) is presentation-only.
- **Duplicate markdown sanitize helpers** — `renderMarkdown` in `lf-inline-field.component.ts` and `palette-node-detail-popover.component.ts` (field-reshuffle/copy glue at UI layer).
- **Duplicate port-visibility helpers** — `isHidden` / `inputWireType` in `resolve-diagram-node-ports.ts` and `palette-node-preview.component.ts` (acceptable until a second real consumer packaging exists; note as streamline).
- **Sibling feature coupling** — palette drag preview reuses canvas port-row/inline-field components instead of app-level primitives (see finding #1).

## Streamlining & simplifications

- `flow-canvas.component.ts`: replace `combineLatest([single]).subscribe(([payload]) => …)` helper with direct `raw[key].pipe(takeUntilDestroyed()).subscribe(…)` (finding #4).
- Deduplicate `renderMarkdown` (marked + DOMPurify) into one shared helper under `components/` or `diagram/` used by inline-field + palette popover.
- Promote `LfInlineFieldComponent` / `LfNodePortRowStaticComponent` (and drag MIME/layout constants) to `app/components/` or `app/diagram/` so palette and canvas stop importing each other's feature folders.
- Convert chunk `function` helpers to `const … = () =>` when touching those files (style gate).
- `handleNodeDragEnded` / `handleSelectionRemoved`: `map` payloads then short side-effect loop (prepare-then-mutate nit).
- Move orphaned JSDoc from `applyPalettePortsToLiveNodes` onto `applyConfirmedSelection` (finding #5).

## Design-flaw fixes

1. ~~**Mount-once model + long-lived hydrate flag**~~ **addressed 2026-07-22** — remount per workflow id + reset hydrate on seed graph identity change.
2. ~~**Preview values as append-only live cache**~~ **addressed 2026-07-22** — `scan` from feed snapshot + live append; clear on null feed / new run / workflow switch.
3. ~~**Palette in `modelAdapter` deps**~~ **addressed 2026-07-22** — `modelAdapter` reads palette via `untracked`; subsequent `palette` inputs patch live `portsConfig` only.

## Findings

1. **Severity:** Important
    - **Path / symbol:** `features/palette/components/palette-node-preview.component.ts`, `palette-drag-preview.component.ts` → `../../canvas/components/lf-inline-field.component`, `lf-node-port-row-static.component`; `features/canvas/components/flow-canvas.component.ts` → `../../palette/utils/palette-drag-layout.js`, `palette-drag-mime.js`
    - **Problem:** Sibling features import each other's modules — violates `packages/ui/AGENTS.md` import boundary (“A feature must not import another feature's components”). Creates bidirectional canvas↔palette coupling; shared primitives (`LfInlineFieldComponent`, port-row static, drag MIME/anchor) are owned by the canvas slice but consumed by palette (sidebar also imports inline-field outside this chunk).
    - **Proposed fix:** Promote shared port/inline/drag primitives and drag contract constants to `app/components/` or `app/diagram/` (two real consumers). Keep palette and canvas feature folders for feature-specific orchestration only.

2. **Severity:** Suggestion
    - **Path / symbol:** `flow-canvas.component.ts` — local `subscribe` helper (~335–347)
    - **Problem:** `combineLatest([singleSubject])` unpacks a 1-tuple for no multi-source reason.
    - **Proposed fix:** Subscribe the Subject/Observable directly with `takeUntilDestroyed`.

3. **Severity:** Suggestion
    - **Path / symbol:** `lf-inline-field.component.ts` `renderMarkdown` (~15–23) and `palette-node-detail-popover.component.ts` `renderMarkdown` (~35–46)
    - **Problem:** Duplicated marked+DOMPurify sanitize path.
    - **Proposed fix:** One shared helper under `components/` or `diagram/` used by both.

4. **Severity:** Suggestion
    - **Path / symbol:** `palette-node-preview.component.ts` — `isHidden`, `inputWireType` (~31–41) vs `diagram/resolve-diagram-node-ports.ts` (~61–78)
    - **Problem:** Parallel port-label/wire-type derivation for palette preview vs live canvas rows.
    - **Proposed fix:** Extract shared pure helpers next to `resolve-diagram-node-ports.ts` (or a sibling `diagram/port-label.ts`) when touching either side; palette preview can stay a lighter projection if semantics differ.

5. **Severity:** Suggestion
    - **Path / symbol:** `flow-canvas.component.ts` — JSDoc blocks (~612–622) above `applyPalettePortsToLiveNodes`; `applyConfirmedSelection` (~653) undocumented
    - **Problem:** Orphaned JSDoc describes selection reconciliation but sits on the wrong method.
    - **Proposed fix:** Move the selection JSDoc onto `applyConfirmedSelection`.

6. **Severity:** Suggestion
    - **Path / symbol:** `lf-node.component.ts` / `lf-edge-chrome.component.ts` — pulse `subscribe` + `setTimeout`
    - **Problem:** Transient pulse still driven by subscribe writing a signal; timer is cleared on destroy (2026-07-22 partial fix) but pattern drifts from fold/`timer` Rx preference.
    - **Proposed fix:** Optional `timer(PULSE_MS)` fold or `switchMap` per event; current code is acceptable if left as explicit edge effect.

7. **Severity:** Suggestion
    - **Path / symbol:** `lf-node.component.ts` — `startLabelEdit` `document.querySelector` (~357–372)
    - **Problem:** Focus uses global DOM query by `data-node-id` though `#labelInput` `viewChild` exists (topbar rename uses `viewChild` + `queueMicrotask` pattern).
    - **Proposed fix:** Focus via `viewChild<ElementRef<HTMLInputElement>>('labelInput')` after `afterNextRender`.

8. **Severity:** Suggestion
    - **Path / symbol:** `flow-canvas.component.ts` — `handleNodeDragEnded` / `handleSelectionRemoved` (~509–597)
    - **Problem:** Side-effect `for` loops issue bridge intents inline; mild prepare-then-mutate nit.
    - **Proposed fix:** Build intent payloads with `map`, then loop `next`.

9. **Severity:** Suggestion
    - **Path / symbol:** `canvas-viewport-sync.ts`, `palette-projection.ts`, `workflow-topbar-projection.ts`, `resolve-diagram-node-ports.ts`, `palette-drag-image.ts` — exported `function` helpers
    - **Problem:** Violates PRINCIPLES arrow-function rule (widespread in this chunk).
    - **Proposed fix:** Convert when editing; no dedicated PR unless enforcing lint.

## Non-issues / looked OK

- No production `withLatestFrom`, no barrel `index.ts`, no `interface` in sampled production files.
- Dynamic ports: live `edges()` + `resolveNodePorts` — BUG-2026-07-11c class addressed for router slots.
- Back-edge geometry via `createBackEdgeAwareOrthogonalRouting` / auto routing; stuck `manual` scrub on diagram init.
- `diagram-port-id` re-exports runtime bypass encode/decode — no third parallel slot encoding.
- Palette drag ghost sizing (`inline-block` / `max-content`) matches BUG-2026-07-20 fix.
- Topbar: immutable `scan` projection + bridge intents; dirty/save from server status; rename focus via `viewChild`.
- Palette sidebar: snapshot→`paletteFromSnapshot` projection; UI-only filter/collapse signals; `effect` seeds collapse keys once (UI-only, not bridge mirror).
- `NodeContentMinSizeService`: imperative resize floor registry (not a bridge fact mirror) — appropriate.
- App shell (`app.component` / `app.config` / `app.routes` / `lf-hover-tip` / `project-dir`) thin and bridge/async-pipe clean.
- Canvas constructor delta applies use `takeUntilDestroyed` for diagram mutation side effects.
- Previously Critical hydrate/palette-reseed/preview-cache issues from 2026-07-21 report remain fixed on re-verification.

Return Status: Critical=0 Important=1 Suggestion=8
