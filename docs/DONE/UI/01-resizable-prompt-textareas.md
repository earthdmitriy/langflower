# UI 01 — Multiline prompts: floor + node flex fill (ADR-017)

**Status:** done (supersedes grip-resize acceptance)  
**Depends on:** nothing  
**Bridge / persistence:** none new — only node height persists (SE resize /
row-count re-fit). No `ui.inlineHeights`.  
**Index:** [README.md](README.md)  
**ADR:** [ADR-017](../../ADR.md#adr-017--canvas-multiline-node-flex-fill-not-textarea-self-resize)

## Goal

Inline multiline prompts on the canvas stay readable (100px floor + scroll)
and absorb extra height when the user SE-resizes the node. Node authors
choose which fields grow via `InlineConfig` `flex`.

## Current behavior

[`lf-inline-field.component.ts`](../../../packages/ui/src/app/features/canvas/components/lf-inline-field.component.ts):

- Canvas `text-multiline` → `<textarea>` with `resize: none`, min-height
  100px, `.lf-scroll`
- Inspector (no `fill`) → same field with `resize: vertical`, no max-height
- Object form `{ type: 'text-multiline', flex?, minHeightPx? }`; shorthand
  `'text-multiline'` ⇒ `flex: 1`
- Canvas `fill` when `flex > 0` — field stretches inside the port row

## In scope

1. Canvas inline `text-multiline` (LLM prompts and other multiline ports).
2. No native textarea grip; grow via node SE resize + CSS flex weights.
3. `data-no-drag` / `data-no-pan` on the field so editing does not drag the node.
4. Dark/light scrollbar via `.lf-scroll`.

## Out of scope

- HITL composer textarea (panel; keep its own layout).
- Per-field height persistence (`ui.inlineHeights`) — deferred (ADR-017 A).
- Horizontal node resize policy (see [03](03-node-resize-handle.md)).

## Acceptance criteria

1. On the **canvas**, user cannot drag a textarea grip; overflow scrolls with
   themed scrollbar.
2. SE-resizing a node taller grows opted-in multiline fields (`flex > 0`)
   proportionally; `flex: 0` stays at min height.
3. Shorthand `'text-multiline'` grows (`flex: 1`); inspector (no `fill`) allows
   ephemeral `resize: vertical` (no height persistence).
4. No visual regression on single-line / select / boolean inline fields.
5. Dragging from node chrome/header still moves the node.

## Implementation notes

- Types: `InlineTextMultilineConfig` /
  `resolveMultilineInlineLayout` in
  `packages/node-sdk/.../io-helpers.ts`.
- Canvas: `lf-node-port-row` `--grow` + `lf-inline-field` `[fill]`.
- CSS: `.lf-node-content` flex fill; `.lf-port-row-wrapper--grow` in
  `node-port-layout.css`.
