---
kind: architecture
owner: ui
covers: ['packages/ui/**']
status: current
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
shared layout in `node-port-layout.css` — see [Port layout rules](./diagram-canvas-incidents.md).

**Prevention:** See [Port layout rules](./diagram-canvas-incidents.md) below. DOM rows alone
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
Shared components: `lf-node-port-row` (stacked in/out), `lf-node-bypass-port-row`
(router).

**Prevention:** Do not position port dots via grid columns or margin hacks.
Use the shared layout contract; see [Port layout rules](./diagram-canvas-incidents.md).

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
- `autoSize: true` for `common-preview` in `bridge-diagram.ts`.

**Prevention:** See [Node sizing](DIAGRAM_CANVAS.md#node-sizing) and [Preview pattern](DIAGRAM_CANVAS.md#preview-node-pattern).

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

**Prevention:** See [Edge chrome](DIAGRAM_CANVAS.md#edge-chrome-select--hover--execution). Never
rely on DefaultEdge-only selectors for custom edge templates; style via
inherited `--edge-stroke` / host classes.

---
