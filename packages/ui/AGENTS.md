# @langflower/ui

Angular 22 SPA for the Langflower editor. Rebuilt around the typed WebSocket
bridge.

## Source of Truth

`LangflowerBridgeClient` is the only domain source of truth.

- Transport lives in `src/app/services/langflower-bridge.service.ts`.
- Components read facts from `inject(LangflowerBridgeService).raw`.
- Components send intents with `client['*.requested'].next(payload)`.
- Project domain state from snapshots and delta facts — do not treat server
  pushes as RPC replies tied to a single tab's last command.
- Do not introduce REST clients, RPC envelopes, DTO adapters, or glue services.
- Do not mirror bridge facts into local `BehaviorSubject` caches.

Allowed local state is UI-only: theme mode, panel sizes, focus, hover, drag, and
temporary text in controls that has not become a domain intent.

## Delete Obsolete Code Immediately

When a pattern is replaced, delete it in the same change.

- No deprecation periods or compatibility shims.
- No "legacy" sections in docs or comments — remove the old thing.
- Do not keep parallel APIs "for tests" or "for migration".
- If bridge data is insufficient, extend `langflowerWsConfig` instead of adding UI
  glue.

## Architecture

```
langflowerWsConfig
  -> LangflowerBridgeClient
  -> root platform services / RxJS projections
  -> adapted feature slices / async pipes (prefer) / signals when needed
  -> Standalone UI components
  -> typed bridge intents
```

`src/app/services/` is the root platform and cross-feature orchestration layer.
It owns the typed bridge client, remount-safe projections, execution folds, and
UI-wide services. It is not a generic dumping ground and not a parallel feature
tree. `src/app/features/<feature>/` contains adapted feature slices: components
plus feature-owned pure types/helpers.

Derive presentation with pure RxJS (`map`, `scan`, `combineLatest`, …). When
data arrives as an `Observable`, keep the stream and bind with `async` pipe in
the template — do not default to `toSignal(..., { initialValue: null })` just
to read values in the class. Use `toSignal` / `computed` when you actually need
signal composition or a meaningful non-null `initialValue`. Details:
[`docs/REACTIVITY.md`](../../docs/REACTIVITY.md) § Observables and signals.

If a screen needs data that is not available on `LangflowerBridgeClient`, stop
and extend `packages/shared/src/langflower-bus-config.ts` plus the shared
payload types first.

## Types

- **Reuse domain types from `@langflower/shared`** — do not create parallel local
  types that duplicate an existing shape.
- Need an extra field? Extend with intersection: `RuntimeEdge & { readonly … }`.
- Boundary conversion is **one-way only**: `RuntimeEdge` → ng-diagram `Edge`
  via `persistedEdgeToDiagram`. Do not convert `Edge` back to `RuntimeEdge`;
  port sync works on diagram `Edge[]` (`sourcePort` / `targetPort`).

## Data prep vs side effects

- Prepare immutable payloads with `map` / `filter` before invoking ngDiagram or
  emitting bridge intents.
- Keep the imperative host step short. A loop is acceptable for repeated host
  calls after its payload is prepared; do not mix lookup/filter/derivation and
  mutation behind `continue`.
- Derive node port rows from the live `NgDiagramModelService.edges()` signal.
  Do not cache resolved ports on node data or recreate a resynchronization
  pipeline.

```typescript
const diagramEdges = edges.map(persistedEdgeToDiagram);
this.diagramModel.addEdges(diagramEdges);
```

See [DIAGRAM_CANVAS](docs/DIAGRAM_CANVAS.md) for the live-edge projection
contract and canvas incidents that led to it.

## Import boundaries

- A feature may inject root platform services from `src/app/services/`.
- Platform code may import a pure feature-owned type or helper when that feature
  owns the vocabulary (for example feed projection types).
- Platform code must not import feature components.
- A feature must not import another feature's components. Compose sibling
  features only at the editor/root composition boundary.
- Keep feature-private services/helpers inside their slice; promote them to the
  root platform only when they coordinate multiple features or must survive
  feature remounts.

## Subscribe and effect edges

Classify an edge by what it does, not just by whether it uses `.subscribe()` or
`effect()`:

- **Projection:** derive state with `map` / `scan` / `combineLatest`,
  `shareReplay`, async pipe, or a signal conversion. Do not subscribe merely to
  copy bridge snapshots into another mutable cache.
- **Imperative host edge:** a subscription may publish a bridge intent, mutate
  ngDiagram, attach browser/DOM behavior, or drive another API that is
  inherently imperative. Scope it with `takeUntilDestroyed` or explicit owner
  cleanup.
- **UI synchronization effect:** `effect()` may synchronize signals with local
  UI/DOM state. It must not become a hidden domain-state mirror or duplicate a
  bridge fact.
- **Transport/runtime ownership edge:** long-lived subscriptions belong in the
  owning root service/host and need an explicit lifetime. Keep event-style
  actions distinct from snapshot hydration.

## State sync (snapshot vs event-sourcing)

Several tabs share one server session. On **reconnect** (refresh, new tab) each
client must show the same state without asking which tab caused a change.

| Domain                       | Model                         | What the UI does                                                                    |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Session, workflow, palette   | **snapshot only**             | Replace projection from full slice                                                  |
| Runtime / execution on graph | **snapshot + event-sourcing** | Replace from `executionFeed` on connect; then append **new** `runner.*` events only |

**Reconnect sequence:**

1. `session.state.snapshot` is deliberately slim: `version`,
   `langflowerConfig`, `dividerPositions`, `paletteVisible`, `selectedNode`,
   and `settings` only. It does not contain workflow, viewport, runner,
   execution feed, tool config, or palette catalog. Live Settings updates
   use `editor.settings.snapshot`. Live palette chrome uses
   `editor.paletteVisible.snapshot`.
2. Authoritative connect/reconnect order from
   `packages/server/src/bridge/emit-bootstrap.ts`:
   `session.state.snapshot` → `runner.snapshot` →
   `executionFeed.snapshot` → `runner.checkpoints.snapshot` →
   `toolConfig.snapshot` → `workflow.list.snapshot` →
   `workflow.current.snapshot` → `session.ready` →
   `langflower.config.snapshot` → `langflower.config.draft.snapshot` →
   replayed `runner.permission.ask` events →
   `palette.snapshot` then warm `customPalette.snapshot` (compiled at
   `createServer` before listen — not on connect).
3. Feed / HITL folds must therefore wait for real workflow and palette Subjects
   — do **not** hydrate with `withLatestFrom` + `startWith(empty)` lookup maps
   (false-ready: HITL replies dropped). Canvas palette streams also wait for
   real snapshots (no empty `startWith`). **`withLatestFrom` is forbidden** unless
   a human explicitly confirms the call site — prefer `combineLatest`. Pattern:
   [docs/REACTIVITY.md](../../docs/REACTIVITY.md) § Hydration and
   `withLatestFrom`; bugs: [FOUND_BUGS.md](../../docs/FOUND_BUGS.md)
   BUG-2026-07-21b.
4. Catalog-gated live event streams are hot. Events emitted after the feed
   snapshot but before workflow/palette readiness are not currently buffered;
   do not describe reconnect as a lossless handoff across that window.

`session.ready` marks completion of the core session/workflow snapshots; config,
permission replay, and palette still follow it in the order above.

**When debugging “live OK, reload empty”:** check whether the fold that
builds `feedUserTurns` / awaiting HITL ran against empty palette/types.
Regression sequence lives in
`services/tests/workflow-execution.service.test.ts`
(`replays HITL replies when feed arrives before workflow and palette`).

**After reconnect:**

- Workflow / palette changes → new **full snapshots** (`workflow.list.snapshot`,
  `workflow.current.snapshot`, `palette.snapshot`).
- Canvas topology edits → `editor.*.delta` (broadcast to all tabs).
- Dirty/pristine → `workflow.currentStatus.snapshot` after editor mutations;
  load/save/rename still use `workflow.current.snapshot`.
- Canvas viewport pan/zoom → `editor.viewport.delta` (broadcast); reconnect
  restores `viewport` from the active graph in
  `workflow.current.snapshot`.
- Load/save/rename → `workflow.current.snapshot` (full replace).
- Runtime port activity → **only new** `runner.output-emitted`, `runner.input-received`,
  `runner.done`, … — no full resnapshot per tick.

See also § Workflow Topbar and [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## Feature Structure

Each feature lives in `src/app/features/<feature>/` with this layout:

```
<feature>/
├── components/   # Angular components
├── services/     # Feature-scoped services (create on demand)
├── utils/        # Helper functions, pure logic
├── types/        # TypeScript types
├── styles/       # CSS files
└── tests/        # Test files
```

**Create folders on demand** — only create a subfolder when you have a file to put in it. Do not pre-create empty folders.

Current features:

- `canvas/` — diagram canvas, node rendering, viewport sync
- `canvas-node-status-folding/` — per-node execution chrome (`status$` / `pulse$`)
- `composer/` — HITL composer, drafts, permission asks, Pause
- `editor/` — editor shell (composes canvas, palette, sidebar, composer)
- `feed-folding/` — work-log nested feed projection
- `palette/` — node palette sidebar, drag preview, node previews
- `sidebar/` — work log, inspector, settings
- `topbar/` — workflow topbar, catalog management

## Entry Points

- `src/main.ts` — Angular bootstrap.
- `src/app/app.routes.ts` — root route.
- `src/app/features/editor/components/editor-shell.component.ts` — editor chrome.
- `src/app/features/canvas/components/flow-canvas.component.ts` — ngDiagram host.
- `src/app/features/composer/composer.service.ts` — composer HITL, drafts,
  permission asks, Pause. Injects WES / feed / bridge. WES must not inject
  `ComposerService`.
- `src/app/features/sidebar/` — work log, inspector, and settings slice.
- `src/app/features/topbar/components/workflow-topbar.component.ts` — workflow catalog UI.
- `src/app/services/langflower-bridge.service.ts` — typed bridge client owner.
- `src/app/services/bridge-diagram.service.ts` — pure one-way persisted graph →
  ngDiagram conversion boundary (not an injectable despite the filename).
- `src/app/services/workflow-execution.service.ts` — cross-feature execution
  façade (run gate, live graph, labels, chrome). HITL / drafts / Pause live
  on `ComposerService`, not here.
- `src/app/services/*-projection*.ts` — remount-safe root projections.
- `src/app/services/theme.service.ts` — UI-only dark/light mode.

## Workflow Topbar

Workflow management is bridge-first. The server owns dirty/pristine state and the
in-memory active workflow graph.

### Multi-tab sync (why snapshots)

Several editor tabs can connect to the same server. Workflow state must match in
every tab without asking which tab caused a change.

**Do not use command-reply events** (`workflow.saved`, `*.rejected`, …). Example
failure mode:

| Step | Tab A        | Tab B                              | Server    |
| ---- | ------------ | ---------------------------------- | --------- |
| 1    | Save clicked | —                                  | —         |
| 2    | —            | receives `workflow.saved`          | broadcast |
| 3    | —            | _Which workflow? Catalog updated?_ | —         |

**Use state snapshots instead.** After any workflow intent the server pushes full
slices; every tab applies them the same way:

```
Tab A / Tab B  →  workflow.*.requested  →  Server
Server  →  workflow.list.snapshot       →  all tabs (catalog)
Server  →  workflow.current.snapshot   →  all tabs (active doc + dirty)
```

Tabs never correlate “this snapshot is mine because I clicked Save”. They only
**replace projection** from the latest snapshot in each context.

| Intent                             | Purpose                                                       |
| ---------------------------------- | ------------------------------------------------------------- |
| `workflow.list.requested`          | Refresh catalog metadata                                      |
| `workflow.load.requested`          | Load one workflow into the session editor                     |
| `workflow.saveCurrent.requested`   | Persist the session active workflow to disk                   |
| `workflow.renameCurrent.requested` | Partial-save identity (name/id/file); dirty graph stays dirty |
| `workflow.create.requested`        | Start an empty dirty workflow (not written until save)        |
| `workflow.copy.requested`          | Persist `{id}-copy.json` and open the copy                    |
| `workflow.delete.requested`        | Delete one persisted workflow by id                           |

| Snapshot                    | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `workflow.list.snapshot`    | Catalog metadata rows (no graphs) — apply as full list             |
| `workflow.current.snapshot` | Active workflow document + `dirty` / `pristine` — apply atomically |

On connect/reconnect, both slices arrive as their own
`workflow.list.snapshot` and `workflow.current.snapshot` events. They are not
embedded in `session.state.snapshot`.

## Palette sidebar

Location: `src/app/features/palette/`.

| Piece                                                 | Role                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `components/palette-sidebar.component.ts`             | Bridge: `palette.snapshot` → projection; compact category headers; bordered node rows                                    |
| `types/palette-projection.ts`                         | Group by `source` then `category`; `paletteSecondary` → collapsed **Advanced** (+ domain subcats)                        |
| `components/palette-node-preview.component.ts`        | Borderless mini-node body (`@Input node`) — port dots L/R with `name · wireType`, editable `inline` port stub (disabled) |
| `components/palette-node-detail-popover.component.ts` | Fixed popover shell — **single border**; preview → panel `uiSchema` → markdown `description`                             |

**Canvas parity:** skip `outputsConfigs` with `hidden: true`. Skip hidden
inputs unless they have an editable `inline` (not preview-*) — then show the
field and omit the left handle. Input port `inline: InlineConfig` renders
`lf-inline-field` under the row (preview-family kinds — `'preview'` /
`'preview-markdown'` / `'preview-code'` — are skipped in the static palette
card, nothing to preview without a run); `uiSchema.placement`
(`panel` under card — `inline` placement is retired, see below).
See [`docs/DIAGRAM_CANVAS.md`](docs/DIAGRAM_CANVAS.md) § Port layout.

## Inline editing (port-attached)

`DiagramInlineField` (uiSchema-driven, node-body fields) is retired. Every
on-node editor is now attached to an **input port row** via
`InputPortMeta.inline?: InlineConfig` (`@langflower/node-sdk`):

- `InlineConfig` — `'text'` \| `'text-multiline'` \| `'boolean'` \|
  `'preview'` \| `'preview-markdown'` \| `'preview-code'` \|
  `{ type: 'text-multiline', flex?, minHeightPx? }` \|
  `{ type: 'select' | 'multiselect' | 'radio', options }` \|
  `{ type: 'number', min?, max?, step? }`.
  Shorthand `'text-multiline'` ⇒ `flex: 1`, min 100px; canvas rows with
  `flex > 0` fill leftover node height (ADR-017 — no textarea grip).
- `resolveNodePorts(config, nodeId, edges, nodeInputs)` resolves each
  `DiagramInputPortRow.inline` (explicit-only — no default-on heuristics),
  `.value` (from `nodeInputs[basePortId]` or `defaultValue`), and `.connected`
  (an edge is wired into that handle).
- `lf-node-port-row.component.ts` renders `lf-inline-field.component.ts` under
  the port label when `inline !== null`. Editable kinds are `disabled` while
  `connected`; preview kinds are never disabled (nothing to edit) and read
  their value from `NodePreviewValuesService` (projects live
  `runner.input-received` events, keyed `${nodeId}:${portId}`).
- Portless literal nodes (`common-string` / `common-number` / `common-boolean`)
  moved their `params.value` to a real `value` input port with `inline` set —
  no wire is required; an unconnected port seeds from `defaultValue`.
- `LfNodeComponent.onPortInlineChange` sends the full **merged** `inputs`
  record on `editor.updateNode.requested` — the server replaces the whole
  `inputs` object per payload, so partial patches would wipe sibling ports.

## Styling

Tailwind is the styling and theming system.

- Global Tailwind entrypoint: `src/styles.scss`.
- PostCSS config: `.postcssrc.json`.
- Use Tailwind utilities in templates.
- Use `@layer components` only for repeated local primitives.
- Dark mode is driven by `html[data-theme='dark']` through Tailwind's custom
  variant in `src/styles.scss`.
- **Scrollbars:** any new scrollable container (`overflow-auto` /
  `overflow-y-auto`, especially with `max-h-*`) must also use the `.lf-scroll`
  utility from `src/styles.scss`. Without it, the OS/browser scrollbar shows
  unstyled (common miss on dropdowns, sidebars, overlays). Check light + dark.

See `docs/THEMES.md` and `docs/TYPOGRAPHY.md`.

## Inputs And Controls

Interactive form primitives must be built with native controls plus
`@angular/aria` behaviour/directives where Angular needs headless accessibility
helpers.

- Use Tailwind for visual styling.
- Use semantic `<label>`, `aria-*`, disabled, and described-by relationships.
- Do not add Angular Material or `mat-*` components.
- Do not create custom input state that duplicates bridge facts.
- Promote user-entered values to domain state only through typed bridge intents.

## Build

Run from the repository root:

```bash
node build/tools/agent-run.mjs build-ui
```

Use `verify --quick` when shared protocol/types change.

## When Stuck

See root `AGENTS.md`. Ask before guessing on UX, protocol shape, or canvas
behaviour. If bridge data is insufficient, extend the protocol instead of adding
UI glue.
