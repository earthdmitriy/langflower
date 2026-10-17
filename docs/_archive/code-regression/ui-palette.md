# Code regression — ui-palette

## Meta

- Paths: `packages/ui/src/app/features/palette/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Re-read all seven product files (sidebar, card preview, drag preview, detail popover, `palette-projection.ts`, `palette-drag-image.ts`, `clamp-popover-top.ts`) plus the five colocated tests. ts-scan: `find_references` on `paletteFromSnapshot`, `buildPreviewRowsForTest`, `attachPaletteDragImage`; `list_exports` of projection / drag-image / clamp; `resolve_symbol` on `emptyCustomPaletteSnapshot`. Cross-checked only to reconcile: `execution-catalog.ts` `mergedPaletteFromSnapshots$` (no empty custom `startWith`). LEDGER closed `ui-palette-false-ready-startwith` and `ui-palette-seeded-category-expansion` on 2026-09-20. Not a line-by-line template audit.
- Previous report: 2026-09-19 — Critical=0 Important=2 Suggestion=6 (numbered items; kebab ids assigned here for ledger stability)

## Previous findings (delta mode)

| id                                     | severity  | status | evidence                        |
| -------------------------------------- | --------- | ------ | ------------------------------- |
| `ui-palette-false-ready-startwith`     | Important | fixed  | Closed 2026-09-20 — see LEDGER. |
| `ui-palette-seeded-category-expansion` | Important | fixed  | Closed 2026-09-20 — see LEDGER. |

## Principles check

- **PASS — snapshot replace, not a competing fold.** `paletteFromSystemAndCustom` is a pure replace projection from the two catalog snapshots. Local filter / expand / pin stay UI signals (`packages/ui/AGENTS.md` allow-list).
- **PASS — no barrels, `type` not `interface`, no `withLatestFrom`.** Concrete imports. Shared `PaletteNodeDefinition` / `PaletteConfigPayload` / custom-palette payloads reused. No `index.ts` in the slice. No `withLatestFrom`.
- **PASS — feature-sliced leftovers stayed deleted.** Sidebar imports `lf-hover-tip` from `app/components/`, drag MIME from `app/diagram/palette-drag.ts`, visibility from `EditorPaletteVisibleProjectionService`. Card/drag use `lf-node-port-row-static` + `resolveNodePorts`.
- **PASS — composer-ish host edges.** `attachPaletteDragImage` lists host → create → attach → `setDragImage`. `startPaletteDrag` prepares MIME then calls the host helper. Popover height uses `afterRenderEffect` on the same `#popoverRoot` it positions.
- **PASS — `false-ready` catalog pair.** Sidebar combines raw cached snapshots with no empty catalog `startWith`; category seed waits for both snapshots (LEDGER 2026-09-20).

## FOUND_BUGS signals

- **BUG-2026-07-29 (canvas empty-catalog `startWith`)** — **same mechanism remains on the sidebar.** Invented `{ nodes: [] }` / `emptyCustomPaletteSnapshot` make `combineLatest` emit before both real snapshots exist. Canvas / WES already dropped those `startWith`s.
- **BUG-2026-07-21b** — **not the same mechanism.** That bug was `withLatestFrom` + one-shot hydrate that never re-classified. Sidebar uses `combineLatest` and will re-emit when the real pair arrives; the defect is the synthesized first pair, not a dropped HITL replay.
- **BUG-2026-07-20 — looked held.** `palette-drag-image.ts` still sets `display: inline-block; width: max-content`; drag preview host is `inline-block w-max`. Regression test still asserts shrink-to-content.
- **BUG-2026-07-11d — looked held.** Card preview uses port `inline` via `resolveNodePorts` + `isEditableInline`; preview-family kinds are skipped. Tests still assert string / preview / HITL / Chat Input row shapes. No resurrected `DiagramInlineField`.
- **Not this slice:** BUG-2026-07-22a (canvas `modelAdapter` vs palette identity), BUG-2026-09-18 / HITL catalog skip, BUG-2026-06-26e (palette drop on canvas).

## Glue / adapters / parallel types

none

ADR-backed copies: none. `PaletteSidebarState` / `PaletteSourceSection` are presentation groupings, not a mirror of `PaletteConfigPayload`. `mergePaletteCatalogs` stays the flat lookup merge for canvas / WES.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- Duplicate node-row markup, hide-remount chrome, popover overflow, and test-only helpers are not listed classes.
- No `index.ts`; no `interface`; no `withLatestFrom`. Product files avoid `any`.
- Domain types come from `@langflower/shared`. Drag MIME / offset live in `app/diagram/palette-drag.ts`.
- Card pairing vs stacked drag preview is presentation, not a third dots template.
- Hide control emits `editor.paletteVisible.requested` via `EditorPaletteVisibleProjectionService`.
- Run lock uses `WorkflowExecutionService.isRunning`; drag `preventDefault` when running — tested.
- `clampPopoverTop` is a pure helper with table-driven tests.
- Sidebar scroller uses `.lf-scroll`. `groupByCategory` / `bySource` `push` is local collection build.
- LEDGER Closed 2026-09-20: empty catalog `startWith` and category seed-before-both-snapshots. Do not reopen without a new mechanism.
