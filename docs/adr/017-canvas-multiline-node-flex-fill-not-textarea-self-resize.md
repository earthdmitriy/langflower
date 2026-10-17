---
kind: adr
owner: docs
covers: []
status: current
id: ADR-017
supersedes: []
superseded-by: []
package: docs
---

## ADR-017 — Canvas multiline: node flex fill, not textarea self-resize

**Status:** accepted · **Date:** 2026-07-19

**Context:** Native `resize: vertical` on canvas `text-multiline` grew the
field without growing the ng-diagram node box, so content overflowed and
wires did not remeasure. Per-field height persistence (`ui.inlineHeights` +
ResizeObserver → `resizeNode`) would fix that but couples layout to every
keystroke/grip drag and adds tab/reload sync surface. Node SE resize already
persists node height; authors need a way to say which prompt fields absorb
extra height.

**Alternatives considered:**

- **A — Textarea grip + `ui.inlineHeights`** — grow the node from each field’s
  measured height; persist per-port heights. Rejected for now: high cost
  (measure → `resizeNode` → invalidate → save/load/tab sync) and fights
  content-auto vs width-locked sizing modes.
- **B — No grip; equal CSS flex on every multiline** — cheap, but authors
  cannot weight `systemPrompt` vs `userPrompt` or opt a field out of grow.
- **B+ (chosen)** — No grip; extend `InlineConfig` with object
  `{ type: 'text-multiline', flex?, minHeightPx? }`. Shorthand
  `'text-multiline'` means `flex: 1`, min height 100px. Canvas port rows with
  `flex > 0` share leftover node height; only node height is persisted.

**Decision:**

1. **Canvas** multiline textareas use `resize: none`, min height 100px
   (override via `minHeightPx`), overflow scrolls (`.lf-scroll`).
   **Inspector** (no `fill`) allows ephemeral `resize: vertical` without
   height persistence.
2. `resolveMultilineInlineLayout` maps shorthand/object forms; canvas
   `lf-node-port-row` applies `--grow` + `fill` only when `flex > 0`.
3. Do **not** persist per-field inline heights; SE resize / row-count height
   re-fit remain the sole height writers.

**Tradeoffs accepted:**

- (+) No grip/node desync; wires stay aligned with the diagram node box.
- (+) Authors control grow weights without UI persistence schema changes.
- (+) Inspector (no `fill`) allows ephemeral `resize: vertical` — safe
  outside the node box; height is not persisted.
- (−) Users cannot drag an individual canvas prompt taller than the node
  without resizing the node.
- (−) Unequal prompt importance needs an explicit `flex` on the node
  definition (defaults are equal for shorthand).

**Consequences:**

- `packages/node-sdk/.../io-helpers.ts` — `InlineTextMultilineConfig`,
  `resolveMultilineInlineLayout`.
- `packages/ui` — `lf-inline-field` / `lf-node-port-row` / `node-port-layout.css`.
- Docs: UI 01 (`docs/_archive/DONE/UI/01-resizable-prompt-textareas.md`) acceptance reversed;
  [DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md) § Node sizing.

**Revisit trigger:** Product requires independent per-prompt grip heights that
must survive reload without enlarging the whole node (reconsider approach A).

---
