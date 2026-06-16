# UI 03 — Node resize (bottom-right corner)

**Status:** done  
**Depends on:** sizing contract in
[00-bridge-and-persistence.md](00-bridge-and-persistence.md) § Sizing;
height-after-wires in
[06-height-auto-resize-and-preview-scroll.md](06-height-auto-resize-and-preview-scroll.md)
(mapper rules owned there / shared)  
**Bridge / persistence:** [00-bridge-and-persistence.md](00-bridge-and-persistence.md)  
**Index:** [README.md](README.md)

## Goal

Let the user resize a node by dragging the **bottom-right** corner. Persist
width/height on `ui.position` so size survives reload. After width is set,
never re-enable full `autoSize: true` (would clobber width).

## Current behavior

- [`flow-canvas`](../../../packages/ui/src/app/features/canvas/components/flow-canvas.component.ts)
  already handles `(nodeResizeEnded)` → `editor.updateNode.requested` with
  `ui: { width, height }` (unit test exists).
- [`persistedNodeToDiagram`](../../../packages/ui/src/app/services/bridge-diagram.service.ts)
  always `autoSize: true`, never `resizable: true`. Passed `size` is ignored
  by ng-diagram while `autoSize` is true.
- [`LfNodeComponent`](../../../packages/ui/src/app/features/canvas/components/lf-node.component.ts)
  has **no** `<ng-diagram-node-resize-adornment>` — required for custom-node
  handles.

## In scope

1. Wrap node chrome in `NgDiagramNodeResizeAdornmentComponent`.
2. Mapper (same as 06): `resizable: true`;
   `autoSize = (ui.position.width === undefined)`;
   when width set → `size: { width, height }` with height from persistence or
   safe min — **do not** invent `width: 180` when only height exists.
3. Affordance: emphasize **SE** handle; hide/de-emphasize other corners via
   CSS (confirm classes in installed ng-diagram styles).
4. Respect chrome mins (`min-w-40 min-h-12`); optional diagram resize min.
5. Unit tests: mapper width-gated `autoSize`; SE end still emits width+height.

## Out of scope

- Rotation adornment / group resize.
- Height sync on multi-wire (epic 06).
- Preview scroll (epic 06B — ship before or with mapper).

## Bridge / persistence

- **No new bus keys.** `nodeResizeEnded` → `updateNode` `{ ui: { width, height } }`.
- Server merges into **`ui.position.width/height`**.
- Broadcast `editor.updateNodes` → Tab B mapper must keep `autoSize: false`
  when width present.
- Disk: existing JSON; Save persists sizes. No migration.

## Acceptance criteria

1. SE handle is visible without selecting the node (permanent `.lf-node-se-handle`).
2. Release persists via existing path; Tab B updates; Save + cold load matches.
3. After SE width, later multi-port growth (06) does not change width.
4. SE handle not clipped; content lays out inside the box.
5. Interaction with [01](01-resizable-prompt-textareas.md): textarea `resize-y`
   hit target distinct from SE handle.

## Implementation notes

- ng-diagram: wrap content in `<ng-diagram-node-resize-adornment>`.
- Mapper fix is sync correctness, not only local UX — land with or before 06A.
- Document SE-only CSS fragility in `DIAGRAM_CANVAS.md` if needed.
