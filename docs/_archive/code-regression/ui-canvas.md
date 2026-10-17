# Code regression — ui-canvas

## Meta

- Paths: `packages/ui/src/app/features/canvas/`, `packages/ui/src/app/features/canvas-node-status-folding/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Re-read production folds and hosts (`canvas-node-status.service.ts`, both composers + catalog helper + operators, `types.ts`, `node-preview-values.service.ts`, `lf-canvas-container.component.ts`, `flow-canvas.component.ts` viewport/`modelAdapter`, `canvas-viewport-sync.ts`, `value-pulse-active.ts`, `lf-node.component.ts` chrome + live edges). ts-scan: `find_references` / `find_callers` on `entriesForNode` (declaration only), `runnerDone$` / `runnerInterrupted$` (write + declaration), `getNodeStatusEvents` (`lf-node`), `valueFor` (live + tests), `isPortTelemetry` import in `fold-canvas-node-status.ts`. Sampled HITL catalog hydrate vs BUG-2026-09-18. Not a line-by-line pass of back-edge routing fixtures or every resize test.
- Previous report: 2026-09-19 — Critical=0 Important=2 Suggestion=4 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                     | severity   | status     | evidence                                                                                                                                                                                                                                                    |
| -------------------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-canvas-entries-for-node-dead`      | Important  | fixed      | Closed 2026-09-20 — see LEDGER.                                                                                                                                                                                                                             |
| `ui-canvas-unused-runner-done-sources` | Suggestion | still-open | ts-scan: `runnerDone$` / `runnerInterrupted$` are only declared on `CanvasNodeStatusBridgeSources` and written in the service bag. Folds `Pick` them out; no read. Unused `isPortTelemetry` import in `fold-canvas-node-status.ts` is lint, not this class. |

## Principles check

- **PASS — one concern, one fold.** Status and HITL stay separate `scan`s. Dual HITL (composer vs chrome) is the slice contract, not two writers of one all-nodes map.
- **PASS — no `withLatestFrom`, no barrels, `type` not `interface`.** Container and `foldCanvasNodeCatalog$` wait on cached snapshots via `combineLatest` with no empty `startWith`. No `index.ts`. Public shapes are `type`.
- **PASS — live ports / seed-only `graphInput`.** `LfNodeComponent.connectedEdges` filters `NgDiagramModelService.edges()`. `graphInput` is seed + viewport-hydrate compare only (BUG-2026-07-11c).
- **PASS — `modelAdapter` identity.** Computed tracks `graphInput()`; palette is `untracked` seed; later catalogs patch `portsConfig` via `updateNodes` (BUG-2026-07-22a).
- **PASS — chrome per element.** Node ring/pulse from `CanvasNodeStatusService` + async pipe. Pulse is `valuePulseActive$` (`timer`), not a DOM sweep.
- **PASS — HITL catalog hydrate (BUG-2026-09-18 still held).** Catalog branch rebuilds when `events.length > 0`. `replayNodeHitlFromSnapshot` still returns empty while `catalog === null`; the later catalog action rebuilds stored events.
- **PASS — preview-values run adopt.** Live inputs keep `runId: null` until `started`; `adoptPreviewRunId` treats `null → runId` as this run, not a wipe (BUG-2026-08-18d).
- **PASS — `entriesForNode` deleted.** Preview keeps `valueFor` + the fold (LEDGER `ui-canvas-entries-for-node-dead`, 2026-09-20). Residual unused bag: `runnerDone$` / `runnerInterrupted$` (Suggestion).

## FOUND_BUGS signals

- **BUG-2026-09-18 / BUG-2026-07-21b (false-ready catalog)** — **held.** Status and HITL rebuild on catalog when events exist. No empty palette `startWith` on canvas container or `foldCanvasNodeCatalog$`.
- **BUG-2026-08-18d (started after ports wipes chrome)** — **held** in status / HITL (`resetNodeChromeFoldState` / `resetNodeHitlAwaitState` adopt `null`) and preview (`adoptPreviewRunId`).
- **BUG-2026-08-27 (out pending after green)** — **held** (`appendNodeChromeFrame` clears `hasNonStreamingValue` on output pending and on new input).
- **BUG-2026-08-18c / 07-15b (paint vs fold; per-element chrome)** — **held.** Node pulse is factory `out` + value DTO. No canvas-wide `querySelector` chrome sweep. `startLabelEdit` still uses a one-shot `querySelector` for focus only (not chrome).
- **BUG-2026-07-22a / 07-11c / 07-21e / 07-29** — **held** (`untracked` palette, live edges, no empty palette seed).
- **BUG-2026-07-15b leftover cache** — remount-safe chrome is still the per-element factory. Never-evict `refCount: false` is not the original DOM-sweep mechanism and is not re-filed.

## Glue / adapters / parallel types

none

ADR-backed copies: none in this chunk. `LfNodeData` remains `WorkflowNodePersisted & { portsConfig }`. `persistedNodeToDiagram` / `persistedEdgeToDiagram` stay the single vendor mapper (`app/services/`, not this slice). Twin composer state types are local fold state, not `@langflower/shared` mirrors.

## Streamlining & simplifications

- Drop `runnerDone$` / `runnerInterrupted$` from `CanvasNodeStatusBridgeSources` and the service bag.

## Design-flaw fixes

none

## Findings

1.  - id: `ui-canvas-unused-runner-done-sources`

- class: dead-export
- severity: Suggestion
- first-seen: 2026-09-19
- status: open
- path: `packages/ui/src/app/features/canvas-node-status-folding/types.ts` — `CanvasNodeStatusBridgeSources.runnerDone$` / `runnerInterrupted$`; `canvas-node-status.service.ts` sources bag
- evidence: ts-scan references are declaration + the service writes only. Both composers `Pick` those fields out. Streaming nodes staying amber after done is documented and intentional — the fields are an unused copied WES bag.
- proposed fix: Drop the two unused source fields from the type and the service assignment.

## Non-issues / looked OK

- Never-evict `getNodeStatusEvents` cache / `refCount: false` is remount reuse, not a listed class.
- Two status `scan`s (chrome vs HITL) are the correct split, not a defect.
- Unused `isPortTelemetry` import in `fold-canvas-node-status.ts`: ESLint unused-import, not `dead-export`.
- Historical 2026-09-18 closings that **stayed deleted / held:** HITL catalog skip-unless-had-catalog, `runId: ''` on preview, canvas↔palette bidirectional primitives, ghost paths (`node-inline-inputs`, port popover / hover-zone / pair-row), `DiagramInlineField`, second diagram mapper.
- LEDGER Closed 2026-09-20: `ui-canvas-entries-for-node-dead`. Do not reopen without a new mechanism.
- False-ready: no empty palette `startWith` on container / catalog. Composer `startWith(emptyComposer())` is idle chrome, not a synthesized ready value.
- Live topology: ports from `resolveNodePorts` + live `edges()`.
- Composer vs chrome HITL split: `LfNode` injects `CanvasNodeStatusService` only.
- No production `withLatestFrom`. No `index.ts`.
