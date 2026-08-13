# Specification: Canvas edge and port highlight UX

**Status:** queued  
**Index:** [README.md](README.md)  
**Related:** [wiring-helper.md](wiring-helper.md) (shared draw-highlight + port attributes; run-lock UI)

## 1. Executive Summary & Intent

- **Problem Statement:** Canvas wiring lacks visual affordances: while drawing an edge, users cannot see which ports are type-compatible; when hovering or selecting a node, incident edges are not emphasized (only direct edge hover/select and endpoint ports on selected edges work today). Custom nodes define **open-ended** `wireType` strings — a compile-time CSS matrix per type does not scale.
- **User Prompt Source:**
    1. When dragging port (drawing edge) — highlight compatible ports.
    2. When hovering/selecting node — highlight its edges.
- **External Context:** [UI 04](../DONE/UI/04-selection-edge-port-highlight.md) (selected edge + endpoints, selected node ports). This epic extends — does not redo — that work.

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/ui/src/app/features/canvas/`
- **Target Directories:**
    - `packages/ui/src/app/features/canvas/components/` — flow canvas, port rows, edge chrome, lf-node
    - `packages/ui/src/app/features/canvas/utils/` — draw-highlight CSS builder + inject helper
    - `packages/ui/src/app/diagram/` — port resolution (wire type, connected, pinned)
    - `packages/ui/src/app/features/canvas/styles/node-port-layout.css` — static highlight **appearance**
    - `packages/runtime/src/runtime-editor.ts` — compatibility semantics (reference for CSS template)
- **Architectural Patterns & Boilerplates Enforced:**
    - **Attributes describe ports; CSS selects them; TS only at draw boundaries** — no per-port compatibility scan, no highlight service, no compile-time type enum.
    - **Draw-scoped injected `<style>`** — on draw start, append ~4 CSS rules with **interpolated source `wireType`** (works for custom nodes); remove on draw end/cancel.
    - **Static CSS** owns colors/rings (`var(--lf-*)`); injected block owns **selectors only** (or sets `--lf-port-compatible: 1`).
    - ngDiagram boundary: canvas host `[attr.draw-active]`, port anchors carry metadata attributes ([`packages/ui/AGENTS.md`](../../packages/ui/AGENTS.md)).
    - Local-only chrome — no cross-tab sync (same as UI 04).
- **Pattern & Boilerplate Reference Baseline:**
    - [`lf-node-port-row.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-node-port-row.component.ts): add `[attr.port-type]`, `[attr.port-side]`, `[attr.port-connected]`, `[attr.port-pinned]` on `.lf-port-anchor`.
    - [`lf-node-bypass-port-row.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-node-bypass-port-row.component.ts): same on in/out anchors.
    - [`resolve-diagram-node-ports.ts`](../../packages/ui/src/app/diagram/resolve-diagram-node-ports.ts): extend with **pinned wire type** per input (from live edges + palette), not palette-only `wireType`.
    - [`flow-canvas.component.ts`](../../packages/ui/src/app/features/canvas/components/flow-canvas.component.ts): `edgeDrawStarted` / `edgeDrawEnded` — inject/remove highlight style, toggle `draw-active`.
    - [`lf-node.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-node.component.ts): `connectedEdges` → pass incident flag to edges.
    - [`lf-edge-chrome.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-edge-chrome.component.ts): `lf-edge--node-incident` when edge touches hovered/selected node.
    - [`runtime-editor.ts`](../../packages/runtime/src/runtime-editor.ts) lines 451–479: compatibility template (`any`, exact match, unpinned `dynamic`, pinned `dynamic`).
- **Third-Party Dependencies & Packages:** None.
- **Frontend Presentation Strategy:**
    - **Component Library Standards:** lf-node / lf-edge templates — no Material.
    - **Styling:** static rules in `node-port-layout.css`; dynamic selectors via `#lf-draw-highlight` injected `<style>` in `document.head` (or canvas host).
- **Shared Utilities & Hooks:** `buildDrawHighlightCss`, `mountDrawHighlightStyle`, `unmountDrawHighlightStyle`, `cssEscapeAttrValue`, `resolveEffectiveOutputWireType` (canvas-local or diagram util).
- **Internationalization (i18n) Mechanics:** None.
- **Environment Configuration (ENV):** None.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** Port row templates, diagram port resolution (pinned type), flow-canvas draw lifecycle, static + injected CSS, lf-edge incident class, lf-node hover/select linkage.
- **Affected Files Inventory:**
    - **New Files:**
        - `packages/ui/src/app/features/canvas/utils/draw-highlight-css.ts` — `buildDrawHighlightCss(sourceWireType)`, `cssEscapeAttrValue`, mount/unmount helpers
        - `packages/ui/src/app/features/canvas/utils/draw-highlight-css.test.ts` — CSS output + escaping + template branches (`any` source, `dynamic` source)
        - `packages/ui/src/app/diagram/resolve-input-pinned-wire-type.ts` (optional) — UI-side pinned type from edges (mirror runtime semantics)
    - **Changed Files:**
        - `lf-node-port-row.component.ts`, `lf-node-bypass-port-row.component.ts` — port metadata attributes on anchors
        - `resolve-diagram-node-ports.ts` — expose `pinnedWireType?: string` on input/bypass rows
        - `flow-canvas.component.ts` — draw start/end, inject style, `[attr.draw-active]`, resolve effective source wire type once
        - `lf-node.component.ts`, `lf-edge-chrome.component.ts` — incident edge highlight on node hover/select
        - `node-port-layout.css` — `.lf-port-anchor--draw-compatible` appearance (applied by injected selectors)
        - `packages/ui/docs/DIAGRAM_CANVAS.md` — document attribute contract + injected style lifecycle
    - **Deleted Files:** None (do **not** add `CanvasWiringHighlightService` or per-port `compatibleHighlighted` inputs).

### B. API, Data Contracts & DAL Strategy

#### Port anchor attributes (declarative metadata)

Bind on `.lf-port-anchor` (and bypass in/out anchors):

| Attribute        | Source                                             | Purpose                                         |
| ---------------- | -------------------------------------------------- | ----------------------------------------------- |
| `port-type`      | palette / effective `wireType` string              | open set — custom nodes                         |
| `port-side`      | `'in'` \| `'out'`                                  | only highlight inputs while drawing from output |
| `port-connected` | presence when `connected === true`                 | exclude in `:not([port-connected])`             |
| `port-pinned`    | pinned wire type when input is `dynamic` and wired | pinned `dynamic` accepts only that type         |

Use `[attr.port-type]="wireType()"`, `[attr.port-connected]="connected() ? '' : null"`, etc.

#### Canvas host while drawing

| Attribute        | When                                               |
| ---------------- | -------------------------------------------------- |
| `draw-active`    | presence from draw start until end/cancel          |
| `draw-from-type` | optional debug — effective source wire type string |

Host class: `lf-canvas` (existing or add on `flow-canvas` host).

#### Injected CSS template (draw-scoped)

On draw start, after resolving **effective source wire type** `T` (once — passthrough/inferred output, not palette-only):

```typescript
// buildDrawHighlightCss(T) → string; cssEscapeAttrValue(T) for selector safety
```

Generated rules (mirror [`runtime-editor.ts`](../../packages/runtime/src/runtime-editor.ts) connect check):

```css
/* 1. Exact type match */
.lf-canvas[draw-active] [port-type="${T}"][port-side="in"]:not([port-connected]) …

/* 2. dynamic pinned to T */
.lf-canvas[draw-active] [port-type="dynamic"][port-pinned="${T}"][port-side="in"]:not([port-connected]) …

/* 3. dynamic unpinned */
.lf-canvas[draw-active] [port-type="dynamic"][port-side="in"]:not([port-connected]):not([port-pinned]) …

/* 4. any */
.lf-canvas[draw-active] [port-type="any"][port-side="in"]:not([port-connected]) …
```

**Branches:**

- Source `T === 'any'` → inject rule highlighting all open `[port-side="in"]:not([port-connected])` (or skip type checks).
- Source `T === 'dynamic'` → conservative: highlight unpinned `dynamic` + `any` only (effective type unknown until connected).
- Custom / unknown `T` → same 4-rule template with escaped `T` — **no catalog enumeration**.

Inject: `<style id="lf-draw-highlight">` appended to `document.head`; **remove on draw end/cancel/destroy**.

Static appearance (shared selector suffix):

```css
.lf-port-anchor--draw-compatible {
	/* ring / scale — light + dark via var(--lf-*) */
}
```

Injected rules add this class (or set `--lf-port-highlight: 1`) on matching anchors.

#### Why not a compile-time type matrix?

`wireType` is `string | symbol` in node-sdk ([`port-meta.ts`](../../packages/node-sdk/src/node-factory/define-reactive-node/port-meta.ts)). CSS cannot express “`port-type` equals ancestor `draw-from-type`” without listing values. **Draw-scoped injection** interpolates the current `T` — O(1) rules per draw, works for custom nodes.

#### Node incident edges (part 2 — TS required)

CSS injection does not link nodes to edges. Reuse [`lf-node.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-node.component.ts) `connectedEdges` + `NodeHoverService` / selection:

- When node hovered or selected → set `incidentEdgeHighlight` on touched edge ids.
- [`lf-edge-chrome.component.ts`](../../packages/ui/src/app/features/canvas/components/lf-edge-chrome.component.ts): host class `lf-edge--node-incident` + static stroke rules.

- **Wrapper Strategy:**
    - **Reuse:** endpoint highlight (UI 04), `connected` on port rows, runtime compatibility semantics as template spec.
    - **New:** `buildDrawHighlightCss`, attribute bindings, inject/unmount lifecycle.
    - **No:** `computeCompatiblePorts()`, `ReadonlySet` of port keys, highlight service.
- **Reverse Compatibility Risk Matrix:** Additive attributes + CSS only. No bridge changes.

### C. Security, Identity & Compliance

- **CSS injection safety:** `cssEscapeAttrValue()` on all interpolated wire types (custom nodes may use odd strings). Never interpolate raw user graph labels — only palette `wireType` tokens.

### D. Dataflow Architecture & Evolution

**Compatible ports while drawing:**

1. Port rows render with `port-type` / `port-pinned` / `port-connected` (updated when edges change).
2. User starts edge from output → `flow-canvas` resolves effective source type `T`.
3. Set `[attr.draw-active]=""` on canvas host; inject `#lf-draw-highlight` with `buildDrawHighlightCss(T)`.
4. Browser matches ports via attribute selectors — no Angular change detection per port.
5. Draw end/cancel → clear `draw-active`, remove `<style id="lf-draw-highlight">`.

**Node hover/select → edges:**

1. `NodeHoverService` / selection → node id.
2. `connectedEdges` → mark edge ids incident.
3. Edge chrome applies `lf-edge--node-incident` (static CSS).

### E. Validations & Boundary Conditions

- Unknown / missing source type → inject no rules or empty template (fail-safe, no false highlights).
- Already connected inputs excluded via `:not([port-connected])`.
- Outputs (`port-side="out"`) never matched by draw template.
- Same-node wiring: ngDiagram typically draws out→in across nodes; if same-node draw attempted, template still only matches `port-side="in"`.
- Large graphs: O(1) inject per draw — no O(nodes×ports) TS scan.

### F. Concurrency & State Collisions

- Always unmount `#lf-draw-highlight` on draw end, component destroy, and before re-inject on rapid draw restart.
- If edges change mid-draw, `port-pinned` attribute updates on next port row refresh — selectors re-apply automatically.

### G. Error Handling & Resiliency

- Inject/mount failure → draw still works, no highlight (degraded UX only).
- Missing palette meta → omit `port-type` attribute; port not highlighted.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** `draw-highlight-css.test.ts` — escaped custom types, four rule template, `any`/`dynamic` source branches, mount/unmount idempotency.
- [x] **Unit Testing:** pinned wire type resolution on diagram port rows (vs runtime fixtures if shared util).
- [ ] **Integration Testing:** Optional flow-canvas test with mocked draw events.
- [ ] **E2E / Smoke Testing:** Not required.
- [x] **Manual Verification:** Draw from string / custom type / dynamic; node hover edges.

### B. Manual Verification Script

#### Test Case 1: Compatible ports via injected CSS

- **Prerequisites:** String output + number input + custom-node port type on canvas.
- **Steps:** Start draw from string output; inspect `#lf-draw-highlight` in DevTools; observe highlighted input ports.
- **Expected:** Style block contains `[port-type="string"]`; matching ports show ring; number port does not; clears on drop/cancel.

#### Test Case 2: Custom wire type without catalog CSS

- **Prerequisites:** Custom node with unique `wireType` (e.g. tool handle type).
- **Steps:** Draw from that output.
- **Expected:** Injected rule contains escaped custom type; compatible inputs highlight without adding static CSS per type.

#### Test Case 3: Node incident edges

- **Prerequisites:** Node with 2+ edges.
- **Steps:** Hover node; then select node.
- **Expected:** Incident edges use `lf-edge--node-incident`; clears on unhover/deselect.

### C. Functional Requirements Checklist

- [ ] Port anchors expose `port-type`, `port-side`, `port-connected`, `port-pinned` attributes.
- [ ] Pinned `dynamic` inputs set `port-pinned` from live edges.
- [ ] Draw start: resolve effective source wire type; set `draw-active`; inject `#lf-draw-highlight`.
- [ ] Draw end/cancel: remove injected style; clear `draw-active`.
- [ ] Injected CSS mirrors runtime rules (exact, unpinned dynamic, pinned dynamic, any).
- [ ] Custom / open wire types work without compile-time CSS enumeration.
- [ ] `cssEscapeAttrValue` applied to interpolated types.
- [ ] Static highlight appearance in `node-port-layout.css` (light + dark).
- [ ] Node hover/select highlights incident edges via edge host class.
- [ ] No `CanvasWiringHighlightService` or per-port compatible flags.
- [ ] **`npm run test`** at close-out.

### Verify

- Intermediate (optional): `verify --quick` after `draw-highlight-css.test.ts`.
- **Close-out (required):** `npm run test` or full `verify`.

---

## Appendix — architecture summary

```
┌─────────────────────────────────────────────────────────┐
│  flow-canvas host  [draw-active]                        │
│  on draw start: inject #lf-draw-highlight (rules for T)   │
└─────────────────────────────────────────────────────────┘
         │ attribute selectors (no per-port TS)
         ▼
┌─────────────────────────────────────────────────────────┐
│  .lf-port-anchor                                        │
│    [port-type="string"] [port-side="in"]                │
│    [port-pinned="number"]  (when dynamic + wired)       │
│    [port-connected]        (when wired)                 │
└─────────────────────────────────────────────────────────┘

Node hover/select ──TS──► lf-edge--node-incident (static CSS)
```

**Explicitly out of scope for this epic:** deny wiring while running — see [wiring-helper.md](wiring-helper.md) (reuses draw lifecycle hooks, skips inject when locked).
