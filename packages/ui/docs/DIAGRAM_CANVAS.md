# ngDiagram canvas — context & pitfalls

Guide for restoring editor/canvas context after a break and for avoiding
recurring ng-diagram integration bugs.

Canvas work derives domain data from `LangflowerBridgeClient` and uses Tailwind
for styling. Complements [`AGENTS.md`](../AGENTS.md), [`TYPOGRAPHY.md`](TYPOGRAPHY.md),
and [`THEMES.md`](THEMES.md).

Cross-cutting bugs (execution, WS, DI scope) belong in
[`docs/FOUND_BUGS.md`](../../../docs/FOUND_BUGS.md) — use this incident log for
canvas-specific symptoms; link to `FOUND_BUGS` when the design lesson is broader.

## When stuck — ask (skinbag is your friend)

Canvas bugs are easy to misdiagnose (port CSS, sizing, snap distance, middleware
order). **Interrupt execution** instead of trying random fixes.

- **Skinbag is your friend** — ask the user when repro steps, expected layout,
  or acceptance criteria are unclear.
- **Prefer the AskQuestion tool** for choices you cannot resolve from code
  alone (e.g. port placement, autoSize vs fixed height, multi-wire exceptions).
- Read this doc and grep the incident log below first; if the symptom is new or
  ambiguous, ask before large template or middleware changes.

## Quick file map

| Concern                                              | File                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Node template (ports, inline fields, preview layout) | `src/app/features/canvas/components/lf-node.component.ts`                                                                                    |
| Shared port row (single in/out)                      | `src/app/features/canvas/components/lf-node-port-row.component.ts`                                                                           |
| Shared port pair row (router)                        | `src/app/features/canvas/components/lf-node-bypass-port-row.component.ts`                                                                    |
| Port layout CSS contract                             | `src/app/features/canvas/styles/node-port-layout.css`                                                                                        |
| Port hover info popover                              | `src/app/features/canvas/lf-port-info-popover.component.ts`, `lf-port-hover-zone.component.ts`                                               |
| Multi-input / bypass / output port row resolution    | `src/app/diagram/resolve-diagram-node-ports.ts` (`resolveNodePorts`)                                                                         |
| Inline editors (port-attached)                       | `src/app/features/canvas/components/lf-inline-field.component.ts`, `.../node-preview-values.service.ts`                                      |
| Diagram config (`validateConnection`)                | `src/app/diagram/diagram.config.ts`                                                                                                          |
| Middleware (palette defaults, single-input edges)    | `src/app/diagram/connection-validation.middleware.ts`                                                                                        |
| One edge per input port                              | `src/app/diagram/single-input-edge.ts`                                                                                                       |
| Find incoming edge (disconnect)                      | `src/app/diagram/find-incoming-edge.ts`                                                                                                      |
| Port ID prefix (`in:` / `out:`) + bypass slot handle | `src/app/diagram/diagram-port-id.ts` (bypass `@n` via `@langflower/runtime` `bypassOutputPortId` / `parseBypassOutputPortId`)                |
| Dynamic port rows (multi-input / bypass growth)      | `src/app/features/canvas/components/lf-node.component.ts` — derived **live** from `NgDiagramModelService.edges()`, not cached on node `data` |
| Diagram init / viewport fit                          | `src/app/diagram/diagram-viewport-fit.service.ts`                                                                                            |
| Canvas host                                          | `src/app/features/canvas/components/flow-canvas.component.ts`                                                                                |
| Edge chrome (select / hover / execution colours)     | `src/app/features/canvas/components/lf-edge-chrome.component.ts` + global `lf-edge.*` rules in `src/styles.scss`                             |
| Back-edge route (two-node return wires)              | `back-edge-aware-orthogonal-routing.ts` + `is-back-edge.ts` / `build-below-route-points.ts`                                                  |
| Editor shell (side panels + composer resize)         | `src/app/features/editor/components/editor-shell.component.ts`, `.../editor/utils/clamp-divider-positions.ts`                                |
| Right sidebar (work log / node params)               | `src/app/features/sidebar/`                                                                                                                  |
| Node definitions (shared)                            | `packages/common-nodes/src/**/node.ts` (`@langflower/common-nodes`)                                                                          |
| Port type rules                                      | `packages/shared/src/validators/connection-validator.ts`                                                                                     |

---

## Right sidebar

| Mode                   | Trigger                | Content                                                                                                                                 |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Work log** (default) | No node selected       | `lf-work-log-panel` — feed sections newest-last, output content, collapsed `<details>` of recent inputs                                 |
| **Node params**        | Click a node on canvas | `lf-inspector-panel` — all input ports (including `hidden`), editable inline fields, `uiSchema` panel fields, cached outputs (readonly) |

- Selection: `EditorShellComponent` tracks `session.state.snapshot.selectedNode` /
  `editor.nodeSelected` (mirrors what `lf-inspector-panel.component.ts` already does)
  and swaps the two components in its right `<aside>` — see
  `packages/ui/src/app/features/editor/components/editor-shell.component.ts`.
- Work log source: `WorkflowExecutionService.feedSections` (`packages/ui/src/app/services/workflow-execution.service.ts`),
  a pure fold of `runner.output-emitted` + `executionFeed.snapshot` replay —
  see `packages/ui/src/app/features/sidebar/feed-section.ts` and
  [docs/features/feed-panel.md](../../../docs/features/feed-panel.md).
  Node params surface: [docs/features/inspector.md](../../../docs/features/inspector.md).
- Partial run: a node's own feed sections from a prior `runId` are dropped
  lazily on its first event under a new `runId`; nodes not touched by the
  new run keep their old sections untouched (no `partial-run-plan.ts` —
  that file is planned, not implemented).

### Side panel / composer resize

Palette (left), work-log/inspector (right), and the HITL composer height are
resizable via drag handles on `lf-editor-shell`. Positions persist as
`DividerPositions` (`editor.dividers.requested` / snapshot +
`.langflower/langflower.jsonc`).

| Bound                       | Rule                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Min left / right / composer | Content floors (`120` / `120` / `120` — Tailwind `min-w-[120px]`)                                                                                                       |
| Max                         | **Viewport-relative only** — leave a thin canvas strip (`64px`) between sidebars, and a work-log/inspector band (`80px`) above the composer. No fixed 480/560/320 caps. |
| Server                      | Mins + sanity ceiling (`10000`) only; overlap is enforced on the client                                                                                                 |

Helpers: `clampDividerDrag` / `clampDividerPositionsToViewport` in
`clamp-divider-positions.ts`. Window / shell `ResizeObserver` reclamps and
debounced-persists when the layout shrinks.

---

## Incident log (problems & fixes)

Problems encountered while building the common-node canvas (Constant, Preview,
Concat). Use this section to restore context quickly.

### 1. ngDiagram engine not initialized

**Symptom:** UI crash on load — `Library engine not initialized yet`.

**Cause:** Services called `NgDiagramService.addEventListenerOnce('diagramInit')`
in the constructor before the diagram component mounted.

**Fix:** Defer until `(diagramInit)` on `<ng-diagram>`:
`DiagramViewportFitService.onDiagramInit()`, `WorkflowSyncService` uses
`whenReady()` before `loadWorkflow`.

**Prevention:** Never touch `NgDiagramService` for init-sensitive APIs in
constructors. Wire lifecycle through `flow-canvas.component.ts` `(diagramInit)`.

---

### 2. Edge connected to wrong port (Constant → Preview output)

**Symptom:** Constant wired to Preview **right** (output) port instead of left
input.

**Cause:** Preview input and output both named `text`. ng-diagram resolves
ports by **id**; duplicate logical names produced ambiguous DOM ids.

**Fix:** Prefix port ids in UI and mapper:
`in:<name>` for targets, `out:<name>` for sources (`diagram-port-id.ts`).
Workflow JSON still uses bare names (`targetHandle: "text"`).
Bypass slot handles (`ch`, `ch@1`) are the runtime checkpoint/output encoding —
`toSlotHandle` / `splitSlotHandle` re-export `bypassOutputPortId` /
`parseBypassOutputPortId` from `@langflower/runtime` (do not invent a third form).

**Prevention:**

- Always use `toInputPortId` / `toOutputPortId` in templates and mapper.
- Bypass slots: only `toSlotHandle` / `splitSlotHandle` (runtime-backed).
- Never reuse the same port id for input and output on one node.
- When adding a node, grep for duplicate port names across inputs/outputs.

---

### 3. Constant value not editable

**Symptom:** Value field always readonly.

**Cause:** Inline input template hardcoded `readonly`.

**Fix:** Editable unless port is wired; `fieldChange` updates diagram model via
`diagramModel.model.updateNodes`.

**Prevention:** Inline controls follow: editable when unconnected, disabled when
an edge targets that input port (`inputPortRows` + `isInputWired`).

---

### 4. Concat — multiple input dots at same height

**Symptom:** Two left input ports visually stacked on one Y coordinate.

**Cause:** ng-diagram positions every `side="left"` port at `top: 50%` relative
to the **nearest `position: relative` ancestor**. `.lf-node` had
`position: relative`, so all ports shared the node’s vertical center — not their
row.

**Fix (historical):** Per-row port anchor with padding compensation. Superseded by
shared layout in `node-port-layout.css` — see [Port layout rules](#port-layout-rules).

**Prevention:** See [Port layout rules](#port-layout-rules) below. DOM rows alone
do **not** move connection dots.

---

### 8. Output ports inset from right border (Agent, LLM)

**Symptom:** Right-side output dots sit inside node padding, not on the border;
Agent nodes show only one usable snap point or misaligned edges.

**Cause:** Output rows used CSS grid (`1fr 0`) + `margin-right: -20px` on a
zero-width column. ng-diagram right ports use `left: 100%` of the anchor — the
margin offset did not pull the dot to the node border box (unlike router’s
absolute `right: -20px` anchors).

**Fix:** Unified port layout — `.lf-port-row` with `position: relative` and
`.lf-port-anchor--out { position: absolute; right: calc(-1 * var(--lf-node-chrome-padding-x)) }`.
Shared components: `lf-node-port-row` (stacked in/out), `lf-node-port-pair-row`
(router).

**Prevention:** Do not position port dots via grid columns or margin hacks.
Use the shared layout contract; see [Port layout rules](#port-layout-rules).

---

### 5. Multiple edges on one input port

**Symptom:** User could attach several lines to the same input; only the first
was used in resolution.

**Cause:** ng-diagram allows many edges per target port by default. Later,
live edge replace also exposed a deeper version of the same problem: the canvas
mixed ngDiagram's optimistic edge model with server `removeEdge` / `addEdge`
facts and tried to repair topology through local edge heuristics.

**Fix:** Canvas topology is projected from the authoritative server workflow.
After graph deltas update `activeWorkflow`, `BridgeDiagramService` schedules a
single reconcile and applies the resulting edge diff through ngDiagram's
transaction/model-service lifecycle. The old local `target + targetPort`
supersede heuristic is not the source of truth.

**Prevention:** Do not patch live replace by adding more local edge guesses.
If a node type ever needs multi-wire inputs, model that in workflow/server
topology first, then project it to ngDiagram from the workflow.

---

### 6. Preview — cannot connect to input port

**Symptom:** No snap / link to Preview input; Constant → Preview failed in UI.

**Cause:** Two issues combined:

1. **Layout:** Input port row was **below** the preview textarea, while users
   aimed at the left edge of the textarea.
2. **Sizing:** Fixed `height: 120` with `autoSize: false` while content was
   taller. Port sat outside the useful snap zone (`portSnapDistance` default
   **10px**).

**Fix:**

- Preview-specific row: port anchor **left of** textarea (same row).
- `autoSize: true` for `common-preview` in `workflow-diagram.mapper.ts`.

**Prevention:** See [Node sizing](#node-sizing) and [Preview pattern](#preview-node-pattern).

---

### 7. Angular / dependency tree (upgrade context)

**Symptom:** `ngDiagram` / `InputSignal` errors, duplicate `@angular/core`
versions.

**Fix (repo):** Angular 22, hoisted install, root overrides, `npm run cleanup:install`.

**Prevention:** After dependency changes, run `npm run cleanup:install` and
verify a single `@angular/core@22` at repo root before debugging UI runtime.

---

### 9. Custom edge hover does nothing (idle wires)

**Symptom:** Hovering a canvas wire leaves stroke unchanged; DevTools show
`stroke: var(--edge-stroke, var(--ngd-default-edge-stroke))` with no
`--edge-stroke` set on hover.

**Cause:** ng-diagram’s idle/hover/selected CSS for
`--ngd-default-edge-stroke-hover` lives on **`DefaultEdgeComponent`** under
emulated encapsulation (`ng-diagram-base-edge.default-edge:hover…`). Langflower
uses a custom template (`lf-edge` → bare `ng-diagram-base-edge`). Adding
`class="default-edge"` on that host does **not** attach DefaultEdge’s
`_ngcontent` styles, so the hover rule never matches. Setting only
`--ngd-default-edge-stroke-hover` on `lf-edge` is also a no-op without a rule
that copies it into `--edge-stroke`.

**Fix:** On idle hover, set **`--edge-stroke`** on the `lf-edge` host (component
`:host:hover:not(.lf-edge--selected)` plus the same rule in global
`styles.scss`). Host also uses `pointer-events: all` so the wide invisible hit
path can activate `:hover` despite `.edges-container { pointer-events: none }`.
Selected / execution colours stay on `lf-edge--selected` and
`lf-edge--pending|value|error` as before.

**Prevention:** See [Edge chrome](#edge-chrome-select--hover--execution). Never
rely on DefaultEdge-only selectors for custom edge templates; style via
inherited `--edge-stroke` / host classes.

---

## Port layout rules (ng-diagram)

Shared contract: [`node-port-layout.css`](../src/app/features/canvas/node-port-layout.css),
[`lf-node-port-row.component.ts`](../src/app/features/canvas/lf-node-port-row.component.ts),
[`lf-node-bypass-port-row.component.ts`](../src/app/features/canvas/components/lf-node-bypass-port-row.component.ts).

ng-diagram port hosts use **absolute** positioning:

```text
:host.left  { top: 50%; left: 0 }
:host.right { top: 50%; left: 100% }
```

Implications:

1. **Containing block matters.** Each port’s `top: 50%` is relative to the
   closest ancestor with `position: relative` (or absolute/fixed).
2. **One anchor per port row.** Each `<ng-diagram-port>` lives in
   `.lf-port-anchor` inside `.lf-port-row` (`position: relative`) so `50%`
   means “center of this row”, not “center of the whole node”.
3. **Pull dots to the node edge.** Node chrome uses `--lf-node-chrome-padding-x`
   (default `20px`) on `.lf-node-chrome`. Anchors use absolute offsets:
   `--in` → `left: calc(-1 * var(--lf-node-chrome-padding-x))`,
   `--out` → `right: calc(-1 * var(--lf-node-chrome-padding-x))`.
   **Do not** use grid columns (`0` / `1fr`) or margin hacks for port position.
4. **`originPoint`.** Use `centerLeft` on input ports. Output ports omit
   `centerRight` (router pattern) — absolute anchor + `left: 100%` is sufficient.
5. **Measurement.** Ports are found via `[data-port-id]` and
   `getBoundingClientRect`. Zero-size or off-screen anchors produce missing or
   unsnappable ports.

### Layout modes

| Mode        | Component                                  | When                                    |
| ----------- | ------------------------------------------ | --------------------------------------- |
| **SideRow** | `lf-node-port-row` (`side="in"` / `"out"`) | Stacked inputs then outputs (`lf-node`) |
| **PairRow** | `lf-node-port-pair-row`                    | Input + output on same Y (`lf-router`)  |

### Input port checklist

- [ ] One `lf-node-port-row side="in"` (or pair row) per input port
- [ ] Port inside `.lf-port-anchor--in` with row `position: relative`
- [ ] Row content (inline field, label, or preview) gives non-zero height
- [ ] `side="left"` + `type="target"` + `originPoint="centerLeft"`
- [ ] Unique `id` via `toInputPortId(portName)`
- [ ] Node `size.height` fits all rows **or** `autoSize: true`

### Output port checklist

- [ ] One `lf-node-port-row side="out"` per visible output port
- [ ] Port inside `.lf-port-anchor--out` (`position: absolute; right: -padding`)
- [ ] Label in `.lf-port-row__content` with `text-align: right`
- [ ] `side="right"` + `type="source"` (no `originPoint` unless verified needed)
- [ ] Unique `id` via `toOutputPortId(portName)`
- [ ] `autoSize: true` when many output rows (Agent, LLM)

### Multi-input node checklist

Same as [Input port checklist](#input-port-checklist) — one row per slot handle.

---

## Port ID & workflow handles

| Layer               | Input example                | Output example                 |
| ------------------- | ---------------------------- | ------------------------------ |
| Workflow JSON       | `targetHandle: "text"`       | `sourceHandle: "value"`        |
| Diagram edge        | `targetPort: "in:text"`      | `sourcePort: "out:value"`      |
| `<ng-diagram-port>` | `[id]="inputPortId('text')"` | `[id]="outputPortId('value')"` |

**Multi input slots** (logical port `lines` with `multi: true`):

| Slot | Workflow `targetHandle` | Diagram port id |
| ---- | ----------------------- | --------------- |
| 0    | `lines`                 | `in:lines`      |
| 1    | `lines@1`               | `in:lines@1`    |
| N    | `lines@N`               | `in:lines@N`    |

Slot list is stored on the node as `data.multiInputSlots.lines` (ordered handles).
Palette drop and mapper init one slot per multi port; middleware appends the next
handle when **all** current slots are wired.

`diagram.config.ts` → `validateConnection` parses prefixed ids before calling
`NodeDefinitionIndexService.getInputPortType` / `getOutputPortType` (base name
resolved via `resolveInputPortBaseName`).

---

## Multi input ports (dynamic slots)

Nodes with `multi: true` on an input port (e.g. `common-collect` / `lines`), and
bypass channel ports (e.g. `common-router`), grow a trailing empty slot as they
get wired. This is computed **reactively**, not patched imperatively:

1. **Live derivation** — `LfNodeComponent` computes `inputPortRows()` /
   `bypassPortRows()` from `resolveNodePorts(portsConfig, nodeId, connectedEdges)`
   (`resolve-diagram-node-ports.ts`), where `connectedEdges` is a `computed()`
   filtering `NgDiagramModelService.edges()` (the **live** reactive signal) by
   node id. Every edge add/remove or unrelated node update automatically
   re-triggers this `computed()` — there is nothing on node `data` to patch or
   go stale.
2. **Growth rule** — for each base port, the highest wired slot index + 1 is
   always rendered as a free row (`maxInputSlot` / `maxBypassSlot` in
   `resolve-diagram-node-ports.ts`).
3. **One edge per slot** — `single-input-edge` still applies per **slot** handle
   (`lines` vs `lines@1` are independent).
4. **Disconnect** — hover `×` removes the edge; the trailing empty row
   disappears on its own next time `connectedEdges()` recomputes (no separate
   trim step needed).
5. **Wire-only MVP** — multi ports do not show inline editors (`supportsInlinePortInput`).

**Superseded:** an earlier version of this feature patched `data.ports` in
place from `bridge-diagram.service.ts`'s `buildDynamicPortUpdates` on every
`editor.addEdges` / `editor.deleteEdges` delta. That pipeline was deleted — it
raced with `editor.updateNodes`/`editor.addNodes`, which recomputed the same
port rows from `graphInput().edges`, a **frozen init-time snapshot** (see the
`graphInput` rule below and `docs/FOUND_BUGS.md`), silently reverting the
patch on any unrelated node update (e.g. a drag). Do not reintroduce
data-cached port rows; derive them live in the component instead.

**`graphInput` is an init-only snapshot.** `FlowCanvasComponent.graphInput` /
any `WorkflowPersistedGraph` passed into it is bound **once**, from the first
`workflow.current.snapshot` push, purely to seed `initializeModel` inside the
`modelAdapter` computed. It is never refreshed by incremental `editor.*`
deltas. **Never read `graphInput()` for "current" edges/nodes after diagram
init** — the live source of truth from that point on is
`NgDiagramModelService` (`.nodes()` / `.edges()`), which every mutation
(`addEdges`, `updateNodes`, …) actually keeps current.

**Palette is not a model-seed dependency.** `modelAdapter` reads `palette`
via `untracked` for the initial `portsConfig` only. Later `palette` input
changes patch live node `data.portsConfig` through `updateNodes` — they must
**not** re-call `initializeModel` (BUG-2026-07-22a).

Manual check: drop Collect → wire two Constants → third empty slot visible
below. Wire an edge to a router's bypass port → drag the router → the empty
slot must still be there afterwards (regression for the bug above).

---

## Node sizing

Sizing is **width-gated** in
[`persistedNodeToDiagram`](../src/app/services/bridge-diagram.service.ts)
(see `docs/DONE/UI/00-bridge-and-persistence.md` § Sizing):

| Mode             | Condition                                          | `autoSize` | Behavior                                                                                                                 |
| ---------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| A — content auto | `ui.position.width` unset                          | `true`     | Both axes follow content; Preview/textareas are CSS-capped so huge text does not dominate height                         |
| B — width locked | `ui.position.width` set (SE resize / paste / load) | `false`    | Width sticky; on **port row-count** change, height is re-fitted and persisted via `updateNode` `{ ui: { height } }` only |

- All custom nodes are `resizable: true` and wrap content in
  `<ng-diagram-node-resize-adornment>`. The library only mounts handles while
  selected — we render a permanent `.lf-node-se-handle` (always visible
  diagonal-slash corner grip) that drives `resizeNode` +
  `editor.updateNode.requested`.
- **Host fill:** only `lf-node` (`:host.lf-diagram-node`), its resize
  adornment, and `.lf-node-chrome` are `width/height: 100%` of the diagram
  box. Port-row hosts (`lf-port-row-host`) stay content-sized flex children of
  `.lf-node-content` — never `height: 100%` (that stacked every row on top of
  the others). Content lives in `.lf-node-content` for min-size measure.
  Grow rows must keep `overflow: visible` on the host/wrapper so
  absolutely-positioned port anchors (negative left/right) are not clipped;
  clip only `.lf-port-row__inline`.
- Min size: `resize.getMinNodeSize` + clamp on `nodeResizeEnded` via
  `NodeContentMinSizeService`. Floor is **intrinsic** (grow multiline rows
  use label + `--lf-multiline-min`, not collapsed flex height) so SE resize
  cannot hide inputs; mode B also clamps back up if already below the floor.
- Never invent `width` when only `height` is persisted (that would silently
  enter mode B).
- ng-diagram has no height-only `autoSize` — do not re-enable `autoSize: true`
  after width is set.
- **Multiline fill (ADR-017):** **canvas-only** — `text-multiline` has **no**
  native textarea grip (`resize: none`, 100px floor). Authors opt fields into
  sharing leftover node height via `InlineConfig`
  `{ type: 'text-multiline', flex?, minHeightPx? }` (shorthand
  `'text-multiline'` ⇒ `flex: 1`). Persist **node** height only — never
  per-field `ui.inlineHeights`. Inspector multiline (no `fill`) uses
  `resize: vertical` without persistence.

**Rule:** In mode B, if content exceeds `size.height` before the next
row-count sync, bottom ports may be unreachable until height re-fits (or the
user SE-resizes). Preview text scrolls inside a `max-height` box and must not
drive node height. Opted-in multiline fields fill leftover height instead of
growing the node from the textarea.

---

## Preview node pattern

Preview (`common-preview`) is not special-cased in the template — it renders
through the generic `inputPortRows` / `lf-node-port-row` path like every other
node:

- Input `text` has `inline: 'preview'` — `lf-inline-field` renders a read-only
  `<pre>` (or `preview-markdown` / `preview-code` variants) instead of an
  editable control; preview kinds are never `disabled` since there is nothing
  to edit.
- Preview containers use `max-height` + `overflow-y: auto` + `.lf-scroll` so
  multi-KB values scroll inside the field without resizing the node.
- Live value: `NodePreviewValuesService` (`node-preview-values.service.ts`)
  subscribes to `runner.input-received` and keys values by
  `${nodeId}:${portId}`; `LfNodeComponent.previewValueFor(basePortId)` feeds
  it into the row's `previewValue` input. Before a run starts (or after a
  reload) there is no live value yet — the row falls back to the port's
  design-time `value`.

---

## Edge & connection behaviour

| Rule                    | Where                                                     |
| ----------------------- | --------------------------------------------------------- |
| Type compatibility      | `canConnectPorts` in `diagram.config.ts`                  |
| Passthrough output type | `resolveEffectiveOutputPortType` before `canConnectPorts` |
| One wire per input      | `single-input-edge` middleware                            |
| Workflow sync           | `WorkflowSyncService` on `model.onChange`                 |
| Temporary edges ignored | `diagramModelToWorkflow` filters `temporary !== true`     |

Default `portSnapDistance` is **10px** — users must drop near the visible dot.
If connections feel “impossible”, check port position first, not validation.

---

## Port info popover

Hover a canvas port dot to open a metadata panel **over the node body**:

| Side   | Popover position           | Fields                                                                   |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| Input  | Right of dot (inside node) | Disconnect (when wired), name, wire type, description                    |
| Output | Left of dot (inside node)  | Disconnect all (when wired), name, wire type, stream + help, description |

Components: `lf-port-hover-zone` wraps each `<ng-diagram-port>` inside
`lf-node-port-row` / `lf-node-port-pair-row`. Popover content:
`lf-port-info-popover`.

- **Input disconnect** — removes the single incoming edge
  (`findIncomingDiagramEdge`).
- **Output disconnect** — removes **all** outgoing edges from that port
  (`findOutgoingDiagramEdges`).
- **Stream help** — `?` icon on stream outputs explains live chunks vs final
  downstream value.
- **Touch** — tap port zone toggles pinned popover; Escape or outside tap
  dismisses.
- **Link drag** — popover uses `pointerdown.stopPropagation()`; port dot remains
  draggable (no overlay blocking the port).
- **Vertical anchor** — popover `top` is the port dot center
  (`--lf-port-dot-center-y` on `.lf-port-hover-host`); `transform: translateY`
  shifts by the Disconnect button center (`--lf-port-popover-button-center-y`
  on `.lf-port-info-popover`). Both vars must be set on the **same elements**
  that receive those CSS properties (not the Angular component host).

---

## Edge chrome (select / hover / execution)

Custom edge template: `lf-edge` → `LfEdgeChromeComponent` →
`ng-diagram-base-edge` (edges are created with `type: 'lf-edge'` in
`bridge-diagram.service.ts`).

| State                                        | How it is applied                                                                                                                      | Colour intent                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Idle default                                 | ng-diagram `--ngd-default-edge-stroke` (gray)                                                                                          | Quiet wire                                        |
| Idle **hover**                               | `--edge-stroke` on `lf-edge:hover:not(.lf-edge--selected)` (host + global `styles.scss`)                                               | Mid blue between default gray and selected blue   |
| **Selected**                                 | `lf-edge--selected` → `--edge-stroke` / `--ngd-default-edge-stroke*` blue                                                              | Strong selection                                  |
| Execution pending / value / error            | `lf-edge--pending\|value\|error` → `--edge-stroke` / `--ngd-default-edge-stroke` on host (path `stroke:` in `styles.scss` is fallback) | Dark yellow / green / rose (overrides idle hover) |
| Value pulse                                  | `lf-edge--pulse` animation                                                                                                             | Brief green flash on deliver                      |
| **Back-edge** (lower leg of a two-node loop) | Host `lf-edge--back`; U-route below both node boxes via custom `orthogonal` routing (auto mode)                                        | Return loop from HITL up to FakeLLM               |
| Back-edge without node sizes                 | Same host class; port-Y fallback + `strokeDasharray: '6 4'`                                                                            | Dashed until bounds exist                         |

**Back-edge heuristic:** in a **two-node loop** (reverse edge exists), route
below one leg (no Y-margin — equal centers are same-row):

- **Same row:** leftward leg (`targetCenterX < sourceCenterX`).
- **Stacked** (upper not right of lower): lower→upper return
  (HITL.feedback → FakeLLM).
- **Diagonal** (upper centerX > lower centerX + 40): **swap** — upper→lower
  forward (FakeLLM.response → HITL); feedback stays on built-in orthogonal.
  One-way edges (HITL → Finish) never match. Port fallback mirrors the same
  rules.

**Routing:** matching return edges use a U under both node bottoms
(`build-below-route-points.ts`).

Geometry is recomputed on every node move by
`createBackEdgeAwareOrthogonalRouting` (registered in `flow-canvas`
`diagramInit`, replaces built-in `orthogonal` after capturing it via
`getBuiltinOrthogonalRouting` — `EdgeRoutingManager` is not a runtime export).
Chrome only owns dash / `lf-edge--back`.

**Do not** pass `routingMode: 'manual'` + `points` into `ng-diagram-base-edge` —
base-edge syncs those into the model (`syncEdgePropertiesToModel`) and the
path freezes after drag until reload.

Rules:

1. **Custom templates own hover.** Do not expect
   `ng-diagram-base-edge.default-edge:hover` to style `lf-edge`. Set
   `--edge-stroke` yourself so the path’s
   `stroke="var(--edge-stroke, var(--ngd-default-edge-stroke))"` updates.
2. **Hover colour is between default and selected** — not as dark as selected,
   not as muted as idle gray (`rgb(74 108 182)` light /
   `rgb(120 160 220)` dark).
3. **Hit testing:** `.edges-container` is `pointer-events: none`; the base edge
   SVG keeps a wide transparent path (`stroke-width: 20`) with
   `pointer-events: visibleStroke`. `lf-edge` uses `pointer-events: all` so
   `:hover` on the host fires.
4. **Selected wins over hover** (`:not(.lf-edge--selected)`). Execution path
   `stroke:` rules win over CSS variables while a run paints the wire.

Files: `lf-edge-chrome.component.ts`, global `lf-edge:*` / `lf-edge:hover` in
`src/styles.scss`, tests in `lf-edge-chrome.test.ts` / `is-back-edge.test.ts` /
`build-below-route-points.test.ts` / `compute-back-edge-aware-points.test.ts`.

---

## Disconnecting edges

ng-diagram **cannot** start a linking gesture from an input port (`type="target"`).
`startLinking` returns early for target ports — drag-from-input disconnect is not
available without forking the library.

### Primary: port info popover

When a port has wired edge(s), hover the port dot and click **Disconnect** (or
**Disconnect all (N)** on outputs with multiple edges) in the popover.

Click removes edge(s) via `diagramModel.model.updateEdges`; `WorkflowSyncService`
syncs to `WorkflowStore`. Inline fields re-enable when the row's `connected`
(`DiagramInputPortRow.connected`) becomes `false`.

Helpers:

- `findIncomingDiagramEdge(edges, nodeId, inputPortId)` — input disconnect
- `findOutgoingDiagramEdges(edges, nodeId, outputPortId)` — output disconnect all

`pointerdown.stopPropagation()` on popover controls prevents ng-diagram port
linking from firing.

### Fallback: select edge + Delete

ng-diagram ships `Delete` / `Backspace` → `deleteSelection` for selected edges.
Click an edge, then press Delete. No Langflower code required.

---

## Adding a new common node — checklist

1. **Definition** — `packages/common-nodes/src/<category>/<name>/node.ts`,
   registered in `packages/common-nodes/src/catalog.ts` (no barrel `index.ts`).
2. **Distinct port names** across inputs and outputs on the same node.
3. **Mapper size** — add branch in `workflowNodeToDiagramNode` if layout is
   taller than default.
4. **Template** — use `lf-node-port-row` for port rows; it renders inline
   editors on its own from `InputPortMeta.inline` — no custom body needed.
5. **On-canvas value display** — set `inline: 'preview' | 'preview-markdown' |
'preview-code'` on the input if the node should show upstream data flowing
   through it during a run (`NodePreviewValuesService` supplies the value).
6. **Example workflow** — `packages/server/templates/example-workflow.json.tpl`
   and `demo-project/.langflower/workflows/example.json`.
7. **Tests** — validator/mapper tests; add cases to `single-input-edge.test.ts`
   only if port wiring rules change.

---

## Manual smoke test (canvas)

After canvas changes:

1. Load example workflow — Constant → Preview edge on **left** input.
2. Drop Concat — two left dots at **different** heights; wire `a` and `b`.
3. Rewire Constant to Concat `a` twice — only latest edge remains.
4. Drop new Preview from palette — connect Constant output to left dot beside
   textarea.
5. Edit Constant value inline — updates without reload.
6. Hover wired input row → click × → edge removed; inline field editable again.
7. Drop Collect — wire two inputs; third empty slot appears; disconnect last wired
   row trims trailing empty slot only.
8. Agent node — four output dots on the **right border**; hover `draftResponse`
   — popover left with stream=Yes and help tooltip.
9. Output with two edges — popover shows **Disconnect all (2)**; both removed.
10. Hover an idle (non-selected) wire — stroke shifts to mid blue; select the
    edge — full selected blue; during a run pending/value/error colours still
    override hover.
11. `node build/tools/agent-run.mjs test --unit` and `build-all` pass.

---

## Theming canvas components

Canvas node/edge UI must use theme tokens from [`THEMES.md`](THEMES.md):

| Component                         | Tokens / classes                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `lf-node.component.ts`            | `--lf-bg-surface`, `--lf-border`, `--lf-node-glow-*`, `--lf-node-border-*`, `.lf-btn`, `.lf-node-chrome`                                  |
| `node-port-layout.css`            | `--lf-node-chrome-padding-x`, `.lf-port-row`, `.lf-port-anchor`                                                                           |
| `lf-edge-chrome.component.ts`     | select / idle hover / pending / value / error via `--edge-stroke`; `lf-edge--pulse` / `--back` (path `stroke:` fallback in `styles.scss`) |
| `node-inline-inputs.component.ts` | `.lf-input`, `.lf-textarea`                                                                                                               |

Node UI states (`inactive`, `pending`, `value`, `error`, `hitl`) apply via
`lf-node-chrome--pending` / `--value` / `--error` / `--hitl` classes
(alongside `--selected` / `--hovered`), driven by
`LfNodeComponent` → `CanvasNodeStatusService.getNodeStatusEvents(nodeId)`
(`status$` + `pulse$`). Selected and hover stay outside that fold (diagram
`node.selected` + `NodeHoverService`). CSS cascade in `node-port-layout.css`
is status → pulse → selected → hovered so editor chrome overrides execution
colors. Wire UI states (`inactive`, `pending`, `value`, `error`) apply via
`lf-edge--inactive` / `--pending` / `--value` / `--error` on the
`LfEdgeChromeComponent` host (a custom `NgDiagramEdgeTemplate`; edges carry
`type: 'lf-edge'`), driven by `WorkflowExecutionService.wireStatus(edgeId)`
(raw port states — edges are not streaming-aware). A transient green pulse (a
delivered value) is `lf-node-chrome--pulse` / `lf-edge--pulse` /
`lf-port-anchor--pulse`, from the pure `valuePulseCommands$` /
`valuePulseActive$` helper (`pulseOn` then `pulseOff` via RxJS `timer`) —
nodes bind factory `pulse$` (output `{ value }` only — input delivery does
not green-flash the box); edges/ports still filter live
`getEventsForEdge` / `getEventsForPort` / `getInputEventsForPort`. Port pulse
uses a global infinite keyframe while the class is on (so unwired streaming
outs like `reasoning` / `draftResponse` keep a visible throb without needing
an edge); edge pulse stays a one-shot path animation. **Idle edge hover** is
separate: set `--edge-stroke` on `lf-edge:hover` (see
[Edge chrome](#edge-chrome-select--hover--execution)); do not rely on
DefaultEdge’s `.default-edge:hover` selectors. Styles map to
`.lf-node-chrome--*` border/glow rules in `node-port-layout.css` and the
`lf-edge--*` / `lf-edge:hover` stroke rules in `styles.scss`. Node
`--pending` is a muted 1px amber border only (no outer ring) so emit flash
on ports/edges stays the primary activity cue.

**Node status fold** (`features/canvas-node-status-folding`): any
`input-received` / `output-emitted` → `pending` (amber); streaming output
`value` (`feed.streaming` on event or palette) stays `pending`; non-streaming
output `value` → `value` (green); any output `error` → `error`; chrome HITL
await (port events + palette) → `hitl`. Composer HITL tabs / idle chat-entry /
permission UI stay on `WorkflowExecutionService` — a separate fold; see
`canvas-node-status-folding/README.md`. Streaming-only nodes keep amber after run
done/interrupt. Wire chrome remains the edge-side raw port-state projection:
each `output-emitted` carries the `edgeIds` it flows into. Both chrome sets
are self-contained per element so colour appears as soon as ng-diagram paints
and survives mid-run reconnect (`executionFeed.snapshot` replay). A node never
reached in the current run stays `inactive`.

Partial runs: a node keeps its chrome from the current run only; a new `runId`
clears the per-node fold (same reset as edge chrome).

---

## Related tests

| Test file                                | Covers                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `diagram-port-id.test.ts`                | `in:` / `out:` prefix round-trip                                              |
| `single-input-edge.test.ts`              | Superseded edges on reconnect                                                 |
| `find-incoming-edge.test.ts`             | Incoming edge lookup for disconnect                                           |
| `find-outgoing-diagram-edges.test.ts`    | Outgoing edges for output disconnect all                                      |
| `diagram-canvas-highlight.test.ts`       | Node UI state / highlight resolution                                          |
| `lf-node-chrome.test.ts`                 | `lf-node-chrome--*` from `CanvasNodeStatusService` + pulse + select/hover     |
| `canvas-node-status-projection.test.ts`  | Streaming-aware per-node status append / snapshot parity                      |
| `canvas-node-hitl-projection.test.ts`    | Node-scoped chrome HITL open/close from port events                           |
| `lf-edge-chrome.test.ts`                 | `lf-edge--*` from `wireStatus` + pulse + host pointer-events + back-edge dash |
| `lf-node-port-row-pulse.test.ts`         | Port-anchor `--pulse` from output-emitted / input-received                    |
| `value-pulse-active.test.ts`             | Pure `pulseOn` / `pulseOff` command stream + boolean projection               |
| `is-back-edge.test.ts`                   | Lower-source (return wire) heuristic                                          |
| `build-below-route-points.test.ts`       | Below U-route + `resolveNodeBounds`                                           |
| `compute-back-edge-aware-points.test.ts` | Below vs forward points for replaced `orthogonal`                             |
| `diagram-viewport-fit.test.ts`           | Viewport fit helpers                                                          |
| `feed-section.test.ts`                   | Work log fold/new-section/error/trim reducer                                  |
| `format-port-value.test.ts`              | Port value display formatters                                                 |
