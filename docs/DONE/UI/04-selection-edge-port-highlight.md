# UI 04 — Highlight selected edges and connected ports

**Status:** done  
**Depends on:** nothing  
**Bridge / persistence:** none (local chrome) — see
[00-bridge-and-persistence.md](00-bridge-and-persistence.md)  
**Index:** [README.md](README.md)

## Goal

When the user selects an edge (or node), make the selection readable: emphasize
the selected wire and the ports it connects (and, for a selected node, its
ports more lightly).

## Current behavior

- Nodes: `.lf-node-chrome--selected` in
  [`node-port-layout.css`](../../../packages/ui/src/app/features/canvas/styles/node-port-layout.css)
  (blue ring) — OK.
- Edges: [`lf-edge-chrome.component.ts`](../../../packages/ui/src/app/features/canvas/components/lf-edge-chrome.component.ts)
  only applies **execution** chrome (`inactive` / `pending` / `value` / `error` /
  `pulse`). No use of `edge.selected`.
- Ports: dots/rows have no selection-linked state.
- Hover linkage (`NodeHoverService`) is separate — keep it distinct from
  selection chrome.

## In scope

1. **Selected edge:** host class e.g. `lf-edge--selected` from `edge().selected`;
   stronger stroke / color (align with node selection blue, not feed hover purple).
2. **Endpoint ports:** highlight source/target port dots when that edge is
   selected (inject `NgDiagramSelectionService` or derive from selected edges
   vs port handles inside `lf-node` / port row).
3. **Selected node:** light highlight on all of that node’s ports (weaker than
   edge-endpoint emphasis).
4. Precedence: selection chrome visible over idle; execution pulse may still
   flash; document if execution color temporarily overrides selection.
5. Multi-select: all selected edges get the treatment.

## Out of scope

- Changing execution wire colors.
- Edge labels / mid-point widgets.
- Selection in the work-log feed (already has hover linkage).
- **Syncing edge selection across tabs** (only node selection is on the bus
  via `editor.selectNode.requested` / `editor.nodeSelected`). Port/edge
  highlight is local to the tab’s ng-diagram selection.

## Acceptance criteria

1. Click an edge → edge stroke changes and both endpoint ports highlight.
2. Deselect → chrome clears.
3. Selected node → ports subtly emphasized; selecting an incident edge still
   marks endpoints clearly.
4. Light + dark themes look intentional (no invisible stroke).
5. Tab B does **not** need to mirror Tab A’s edge selection (document as
   intentional).

## Implementation notes

- ng-diagram base edge supports `.selected` / CSS vars
  (`--ngd-default-edge-stroke-selected`); custom `lf-edge` should set stroke
  explicitly from `edge().selected` if host CSS is insufficient.
- Port highlight classes on `.lf-port-dot` in `node-port-layout.css`.
