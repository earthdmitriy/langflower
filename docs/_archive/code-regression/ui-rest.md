# Code regression — ui-rest

## Meta

- Paths: `packages/ui/src/app/` excluding already-chunked `features/editor/`, `features/sidebar/`, `features/feed/`, `features/feed-folding/`, `features/canvas/`, `features/canvas-node-status-folding/`, `features/composer/`, `features/palette/`, and `app/services/`. In-scope: `features/topbar/`, `app/components/`, `app/diagram/`, `app/utils/`, `app.component.ts` / `app.config.ts` / `app.routes.ts`.
- Date: 2026-09-20
- Mode: delta
- Coverage: Re-read the same surfaces as 2026-09-19: topbar (component, projection, project-dir, folder-name + run-lock test); all five `app/components/` files; `diagram/` (`diagram-port-id`, `palette-drag`, `resolve-diagram-node-ports`); `utils/` (`format-port-value`, `render-markdown`); app shell. ts-scan: `find_references` on `resolveNodePorts`, `toSlotHandle`, `isEditableInline`, `PALETTE_DRAG_MIME`, `PALETTE_DRAG_ANCHOR_OFFSET_PX`, `asDisplayString`, `withOrphanSelectOptions`, `formatPortValue`, `renderNodeDescriptionMarkdown`, `selectedSelectDescription`; `resolve_symbol` for leftover `WorkflowStore` / `requestWorkflowDeleteSnapshot` (absent). Diff vs `origin/master` on this slice is import-path + `isEditableInline` export + typed rename input — no new file. Not a line-by-line CSS / fixture-row audit.
- Previous report: 2026-09-19 — Critical=0 Important=0 Suggestion=7 (old format; no finding `id`s or `class` — ids assigned here for ledger continuity)

## Previous findings (delta mode)

none (dropped rows that were not listed classes).

## Principles check

- **PASS — no barrels / `type` not `interface` / no `withLatestFrom`:** Zero `index.ts` under `packages/ui/src/app`. In-scope production files use `type`. No `withLatestFrom` anywhere under `packages/ui/src/app`.
- **PASS — bridge as source of truth:** Topbar folds `workflow.list.snapshot` / `workflow.current.snapshot` / `workflow.currentStatus.snapshot` via `merge` + `scan` and emits `workflow.*.requested`. Project-dir reads `toolConfig.snapshot` with `async` pipe. No REST/DTO clients. Dirty/save comes from server status, not a local command-reply cache. Rename uses typed `Event` + `instanceof HTMLInputElement`.
- **PASS — shared primitives stay in the kernel:** `LfInlineFieldComponent`, `LfNodePortRowStaticComponent`, and `node-port-layout.css` live in `app/components/`. Palette drag MIME/offset live in `app/diagram/palette-drag.ts`. Canvas and palette import those paths. This chunk does not import feature components.
- **PASS — composer entry for port rows:** `resolveNodePorts` lists `resolveInputPortRows` / `resolveOutputPortRows` / `resolveBypassPortRows` as siblings. Slot encoding is one runtime pair (`toSlotHandle` = `bypassOutputPortId`, `splitSlotHandle` = `parseBypassOutputPortId`).
- **PASS — types reused, not mirrored:** Topbar state is `WorkflowListEntry` + `WorkflowCurrentSnapshotPayload` fields. Port rows are view projections over `PaletteNodeDefinition` / ngDiagram `Edge`. Markdown and `formatPortValue` have two-or-more real consumers (ts-scan).
- **PASS — delete-obsolete leftovers:** `WorkflowStore` and `requestWorkflowDeleteSnapshot` do not resolve in UI. No `workflow-diagram.mapper` in this slice. `features/sidebar/liveness.ts` and UI `settings-draft` shims stay out of this chunk (owned/deleted elsewhere).
- **PASS — `startWith` on the topbar scan is not `false-ready`:** Seed is `initialWorkflowTopbarState` (empty list, `activeWorkflow: null`, `pristine`). Save/Rename/Delete stay gated on a real active workflow; chrome shows “No workflow loaded”.
- **N/A — thin server:** UI only.

## FOUND_BUGS signals

none

Looked-held (not recurrences): BUG-2026-06-26 prefix lengths still `in:`/`out:` `slice(3)`/`slice(4)`; BUG-2026-07-22b aliases still runtime-owned; BUG-2026-08-31 guard still on `asDisplayString` + tests; BUG-2026-07-25d paint is a sidebar blank-option duty; BUG-2026-07-21b `withLatestFrom` is absent.

## Glue / adapters / parallel types

none

ADR-unneeded notes (not findings): `toSlotHandle` / `splitSlotHandle` are documented aliases of runtime bypass encode/decode. `DiagramInputPortRow` / `DiagramOutputPortRow` / `PortsConfig` are canvas/palette view rows, not a mirrored graph schema. `formatPreviewValue` vs `asDisplayString` vs `formatPortValue` keep different contracts.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- Cosmetic casts, style, and “could share a helper” notes from 2026-09-19 were dropped (not listed classes).
- LEDGER has no Closed / Wontfix / Perennial rows for this chunk.
- Follow-up **D** leftovers stayed deleted: primitives in `app/components/`, MIME in `app/diagram/palette-drag.ts`. `isEditableInline` is now exported and consumed by palette preview (ts-scan).
- Follow-up **AC** typed rename input is still in place (`handleRenameInput` + `instanceof HTMLInputElement`).
- `fromOutputPortId` / `fromInputPortId` prefix lengths still correct. Bypass encode/decode is runtime-owned.
- `renderMarkdown` / `renderNodeDescriptionMarkdown` is the single sanitize path (palette popover, inspector description, inline preview).
- `formatPortValue` is a real shared util (feed + inspector), not a pass-through wrapper.
- `lf-hover-tip`, `lf-node-port-row-static`, app shell (`app.component` / `app.config` / `app.routes`) are thin. Theme construct-on-inject in `AppComponent` is the host edge for `data-theme`.
- `radioGroupCounter` is UI-only unique `name` generation, not a domain fold.
- `function` vs arrow on the remaining port-row helpers, native `title` on the project-dir chip, and inspector `:host-context` are style / THEMES notes — deliberately not findings.
- Palette sidebar empty catalog seed and composer/WES catalog waits are other chunks.
