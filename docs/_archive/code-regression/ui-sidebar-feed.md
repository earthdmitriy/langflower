# Code regression — ui-sidebar-feed

## Meta

- Paths: `packages/ui/src/app/features/sidebar/`
- Date: 2026-09-20
- Mode: delta
- Coverage: Full inventory of the same 13 files (inspector + settings + helpers + tests). Deep-read: `components/lf-inspector-panel.component.ts`, `lf-settings-panel.component.ts`, `lf-tool-permission-table.component.ts`, `select-empty-option.ts`, `models-field-presentation.ts`, `number-inline-config-from-ui-schema.ts`. Sampled all six tests. Confirmed no `withLatestFrom`, no `index.ts`, no `startWith`. **Not** a re-review of `features/feed/` / `feed-folding/` (live work-log). Feed catalog fallback is out of this chunk.
- Previous report: 2026-09-19, Critical=0 Important=1 Suggestion=5 (old format; no finding `id`s — ids assigned here for ledger continuity)

## Previous findings (delta mode)

| id                                     | severity  | status | evidence                        |
| -------------------------------------- | --------- | ------ | ------------------------------- |
| `ui-sidebar-inspect-provider-autobind` | Important | fixed  | Closed 2026-09-20 — see LEDGER. |

## Principles check

- **PASS — no barrels / `type` not `interface` / arrows.** No `index.ts` under `sidebar/`. Local shapes (`InspectorPanelRow`, `InputPortRow`, `ToolPermissionTableRow`, `ProviderSelectRow`) are `type` + `readonly`. Helpers are arrows.
- **PASS — bridge as SoT for inspector / settings writes.** Field / input / tool-permission writes go through `editor.updateNode.requested`. Settings Save / Discard / patch go through config / secrets / draft intents. Bootstrap uses documented unicast `project.bootstrap.result` (`requestThenWait`). No REST, no `BehaviorSubject` domain cache.
- **PASS — `withLatestFrom` absent.** `panelRows$` is `combineLatest` of `catalogs$` + selection + config + `toObservable(activeGraph)`. Models catalog is a server snapshot fold (`ModelsCatalogProjectionService.catalogs$`).
- **PASS — run lock.** Inspector disables inline fields and tool-permission radios while `isRunning()`; `lf-inspector-panel.run-lock.test.ts` covers idle vs running for field / input / permission emits.
- **PASS — feature-slice import boundary.** `LfInlineFieldComponent` is imported from `app/components/lf-inline-field.component`. No import of another feature’s components.
- **PASS — historical leftovers stay deleted.** `spec.md`, `sidebar/liveness.ts`, `utils/settings-draft.ts`, inspect-time `toolPermissions` persist, `enabledToolIds` / `_legacy`, and the `uiSchema as UISchemaConstItem[]` cast stay gone. `panelUiSchema` remains an identity over `definition.uiSchema`.
- **PASS — domain helpers reused.** `configToDraft` / `draftToSavePayload` / `SettingsDraft` live in `@langflower/shared/langflower-config/settings-draft`. Role-preset / floor helpers come from `@langflower/common-nodes/ai/llm-role-preset`.
- **PASS — inspect-time `providerId` persist.** Inspector no longer persists `providerId` from inspect `effect` (LEDGER `ui-sidebar-inspect-provider-autobind`, 2026-09-20).

## FOUND_BUGS signals

- **BUG-2026-07-25d** (empty `providerId` paints first select option) — **not a recurrence of the paint mechanism.** Blank option via `withSelectEmptyOption`; `nonEmptyProviderId` treats `""` as unset. The remaining inspect-time persist is the official-fix leftover (`FOUND_BUGS` listed auto-bind as part of that fix), filed here as `two-writers`, not `found-bugs-recurrence`.
- **BUG-2026-07-25 / 25c** (client catalog latch) — **not present.** Inspector folds `catalogs$`; `modelsFieldState` always sets `loading: false`.
- **BUG-2026-07-25b** (orphan provider select) — delegated to platform `lf-inline-field` `withOrphanSelectOptions`. Settings native `<select>`s reimplement orphan rows locally. Same signal, not the same mechanism.
- **BUG-2026-07-21b** — **none** in this chunk. Settings `toSignal(catalogs$, { initialValue: {} })` is an empty-start for computed option lists, not a one-shot hydrate of live events.
- **BUG-2026-07-19b** — **does not recur.** Client allowlist strip is gone; table uses `resolveEffectiveToolPermissions` + floor clamp.
- **BUG-2026-07-12 family** — **not the same mechanism.** Inspector still merges whole `inputs` on write (server replace-whole-object). It does not fire defaults on a connected port.
- **BUG-2026-09-19c** — **does not recur in this chunk.** `tests/settings-draft.test.ts` exercises shared `mergeDraftPatch` by `row.id`. UI `@for track $index` is list identity, not secret/connection keying.
- **BUG-2026-09-20** (feed catalog fallback) — **out of chunk.** Do not re-file here.

## Glue / adapters / parallel types

none

ADR-unneeded notes (not findings): `SettingsDraft` is the shared alias; `as NodeId` is a branding gap at the persisted-graph edge; `InspectorPanelRow` is presentation glue; `numberInlineConfigFromUiSchema` maps constraints onto canvas `InlineConfig`.

## Streamlining & simplifications

none

## Design-flaw fixes

none

## Findings

none

## Non-issues / looked OK

- Historical follow-ups **D / O / P / Q / T / AC / AE / AD** for this folder: files and shims stay gone; bootstrap wait-then-intent comment is still accurate; `SettingsDraft` is the shared alias; `uiSchema` needs no cast.
- Live work-log is not in `sidebar/`. Do not re-litigate feed catalog fallback here.
- Cached outputs use `WorkflowExecutionService.latestOutputValue` → `latestOutputValues()` signal. No `NodePreviewValuesService` import.
- `lf-tool-permission-table` is slice-local; radios are native; floor-denied tools are omitted.
- Settings optimistic draft + `draftAfterLayerSnapshot` apiKey/secret hygiene; Save sends a full payload after `flushPatch`. Local `draft` / `syncedBaseline` are the documented optimistic UI draft.
- `isDirty` is server `snap.dirty` plus pending secret values. Provider text dirty waits for the patch ack — acceptable given 250 ms debounce + blur flush.
- `toSignal(catalogs$, { initialValue: {} })` remains an empty-start for option lists, not `false-ready` hydrate of live events (previous reviewer already declined).
- Bootstrap `firstValueFrom(…take(1))` stays the documented unicast `requestThenWait` (subscribe before intent).
- `tool-id-list` is still a live uiSchema type (`enabledMcpIds`, Sub-Agent).
- LEDGER Closed 2026-09-20: `ui-sidebar-inspect-provider-autobind`. Do not reopen without a new mechanism.
- No `index.ts`, no `interface`, no `withLatestFrom`, no ngDiagram mutation in this slice.
