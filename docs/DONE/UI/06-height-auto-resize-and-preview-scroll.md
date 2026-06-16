# UI 06 — Height-only auto-resize + Preview scroll

**Status:** done  
**Owns:** Preview scroll CSS; height sync **after width lock**; mapper
`autoSize` rules (shared with [03](03-node-resize-handle.md))  
**Depends on:** sizing contract in
[00-bridge-and-persistence.md](00-bridge-and-persistence.md) § Sizing  
**Bridge / persistence:** height via `editor.updateNode.requested`
`{ ui: { height } }` **only when width is already persisted**; see 00  
**Index:** [README.md](README.md)

## Goal

1. Multi-input / bypass rows grow or shrink after wiring → node **height**
   keeps ports reachable.
2. User / persisted **width** never changes because of auto-resize or huge
   preview text.
3. Preview (`inline: 'preview*'`) scrolls inside a capped box — long strings
   must not inflate the node.

## Why the old plan was wrong (fixed)

| Flaw                                                                        | Fix                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Contradictory height policy (grow-only vs fit vs “don’t shrink below user”) | **One** policy below                                                   |
| `ResizeObserver` on chrome                                                  | **Forbidden as trigger** — fires on 01 textarea drag and preview ticks |
| Persist height-only while width unset                                       | `nodeSize` then invents `width: 180` and silently locks width          |
| Ship 06A before Preview scroll                                              | Cap Preview **first** or measure = text height                         |
| Rely on ng-diagram height-only `autoSize`                                   | API is boolean only — both axes or neither                             |
| Plan §03 still said `autoSize: true` until “first resize”                   | Width-gated: `autoSize === (width === undefined)`                      |

## Current behavior

- Multi ports: live from edges
  ([`resolve-diagram-node-ports`](../../../packages/ui/src/app/diagram/resolve-diagram-node-ports.ts)).
- [`persistedNodeToDiagram`](../../../packages/ui/src/app/services/bridge-diagram.service.ts):
  always `autoSize: true`; `nodeSize` defaults missing axis to 180×72 when
  either axis is set.
- Preview (`.lf-inline-preview`): no `max-height` / overflow — huge text
  grows chrome → with `autoSize: true` grows the node.
- [`DIAGRAM_CANVAS.md`](../../../packages/ui/docs/DIAGRAM_CANVAS.md) sizing
  table is **stale** (per-type `autoSize`, old mapper path).

## Locked product rules

### Modes

| Mode                 | When                                                  | Width                                       | Height                                                                                        |
| -------------------- | ----------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A — content auto** | `ui.position.width` **unset**                         | ng-diagram `autoSize: true` (both axes)     | grows with port rows; Preview/textareas capped so text does not dominate                      |
| **B — width locked** | `ui.position.width` **set** (SE resize or paste/load) | `autoSize: false`, `size.width` = persisted | on **port row-count change only**, set height to measured content height; width never written |

### Height policy (mode B only)

- On input / bypass / output **row count** change: set height to
  **measured content height** (fit rows + chrome + capped inline fields).
- May grow **or** shrink vs previous height (fit content).
- User SE height is **overwritten** on the next row-count sync (intentional:
  ports win over “reading room”). User may SE-resize again until the next
  wire that changes row count.
- **Do not** sync height on: preview value updates, rename wrap, 01
  textarea `resize-y`, selection chrome.

### Preview

- `max-height` (~8–12rem), `overflow-y: auto`, `lf-scroll`, width 100% of
  content box.
- Preview text never drives node height beyond that cap (mode A or B).

### Persistence

- Mode A: **no** height `updateNode` from this epic (local `autoSize` is enough;
  Tab B grows when it gets `addEdges`).
- Mode B: `updateNode` `{ ui: { height } }` only; never send `width` from the
  auto path. Server `patchPersistedNodeUi` already merges height without
  clearing width.
- Skip write if `|newHeight - current| < 1` (no storm / cross-tab ping-pong).
- No writes while SE drag is active (`nodeResize` in progress).

### Mapper (normative — implement with 03)

```text
width = ui.position.width
height = ui.position.height
autoSize = width === undefined
resizable = true   // when epic 03 ships adornment
if (!autoSize) size = { width, height: height ?? <min content or last measured> }
// NEVER synthesize width: 180 when only height is set
```

## In scope

### B first — Preview scroll (can ship alone)

1. `lf-inline-field` for `preview` / `preview-code` / `preview-markdown`:
   max-height, overflow-y, `lf-scroll`.
2. Unit/style assertion: long string does not force unbounded chrome growth.
3. Rewrite `DIAGRAM_CANVAS.md` sizing table to match this contract (delete
   stale per-type `autoSize` rows / old mapper name).

### A — Height sync (mode B)

1. Detect port **row-count** changes in `lf-node` (from resolved ports /
   connected edges), not ResizeObserver.
2. After render (`requestAnimationFrame` once): measure chrome (or
   row-count × row height + fixed chrome if measure is flaky) →
   `NgDiagramNodeService.resizeNode(id, { width: locked, height }, …, true)`
   **and** `editor.updateNode.requested` `{ ui: { height } }` when width
   locked.
3. Guard: no emit during SE drag; epsilon skip; debounce ≤1 frame batching
   if many edges land together.

## Out of scope

- Multi-port slot algorithm changes.
- Width auto-grow from long labels (truncate/wrap inside width).
- Continuous content-driven height under width lock (textarea drag, preview).
- New bus keys / autosave.

## Conflict matrix (03 + 06)

| Situation                              | Width          | Height                                                               |
| -------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Fresh, no width                        | auto (mode A)  | auto via `autoSize` + capped Preview                                 |
| User SE width (and usually height)     | **locked**     | next row-count → re-fit (mode B)                                     |
| User SE height only, width still unset | still mode A   | ng-diagram owns both until width set                                 |
| Preview floods text                    | unchanged      | unchanged (scroll)                                                   |
| 01 textarea resize-y                   | unchanged      | unchanged under mode B; under A may grow until textarea `max-height` |
| SE drag in progress                    | no auto writes | no auto writes                                                       |

## Acceptance criteria

1. Mode A: wire second multi-input → taller node; Preview with multi-KB text
   scrolls, does not dominate height.
2. Mode B: after SE width, add/remove multi wires → height changes, **width
   unchanged**; no `width` in auto `updateNode` payloads.
3. Height-only persistence never appears while width unset (no accidental
   `width: 180` lock).
4. No updateNode storm / ping-pong across tabs.
5. `DIAGRAM_CANVAS.md` sizing section matches code + this contract.

## Implementation notes

- Touch: `lf-inline-field` styles; `bridge-diagram.service.ts` (`autoSize` /
  `nodeSize`); `lf-node.component.ts` (row-count effect); optionally
  `flow-canvas` resize-in-progress flag.
- Prefer measure after row-count change over hard-coded pixels if port row
  height varies.
- Tests: width sticky under simulated port growth (mode B); preview
  max-height class; mapper never invents width from height-only ui.
- Ship order: **06B → mapper (with 03) → 06A → 03 adornment** (adornment can
  land with mapper; 06A needs mapper first).
