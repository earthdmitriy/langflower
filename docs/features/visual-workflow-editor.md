# Visual workflow editor

## Goal

Let a user compose an LLM chain by dragging nodes onto a canvas and wiring
them together — without writing code — and see the result of every edit
immediately.

## Core Principles

- **Direct manipulation** — nodes and connections are placed and rewired by
  mouse, not by editing JSON or config files.
- **Type-safe wiring** — a connection is only allowed when the source and
  target port types are compatible; invalid connections are rejected at
  drop time, not discovered at run time.
- **Edit primitive values without a wire** — simple values (string, number,
  boolean) can always be entered directly on the node, whether or not that
  port is ever connected.
- **A wire always wins** — if a port is connected, its on-node control is
  disabled and the wired value is authoritative.
- **Every edit applies to the live graph immediately, saving to disk is a
  separate step** — there is no "apply" button for an edit itself: add a
  node, draw a wire, or type into a field, and it is part of the graph right
  away and visible in every other open tab. Writing that graph to disk under
  its current name is the explicit **Save** action described in
  [workflow-management.md](workflow-management.md), which is also what
  clears the "unsaved changes" indicator.

## Feature Details

The editor screen has four areas:

- **Left palette** — every available node type, grouped by category, that
  can be dragged onto the canvas. Less-common / dual-surface graph I/O types
  live under a collapsed **Advanced** group
  ([ADR-023](../ADR.md#adr-023--palette-palettesecondary--collapsed-advanced)).
- **Center canvas** — the interactive graph: place node instances, draw
  connections between ports, move/delete nodes and edges, pan and zoom.
- **Right panel** — either the work log (execution order and outputs) when
  nothing is selected, or the selected node's full parameter/port view
  (including hidden ports and panel-level settings) when a node is clicked.
- **Top toolbar** — workflow load/save/rename/delete, reload node palette,
  and the active project directory. Run/Stop and the chat composer live in
  the right panel's feed instead — see
  [feed-panel.md](feed-panel.md) and [workflow-execution.md](workflow-execution.md).
- **Transport disconnect** — when the WebSocket status becomes
  `disconnected`, a full-viewport overlay blocks the editor (palette,
  canvas, toolbar, composer). A background probe retries `/ws` every few
  seconds and reloads the page when the server is reachable again. The
  overlay does not appear while status is still `connecting`.

**Placing and connecting nodes:**

- Dragging a node from the palette onto the canvas creates a new instance
  with a generated id and default name. While a run is active, palette rows
  are not draggable (`cursor-not-allowed`) and canvas drop does not add a
  node.
- Dragging from an output port to an input port creates a connection, if the
  two port types are compatible. Incompatible connections are refused with
  no edge drawn.
- A node can have at most one connection into any given input port; wiring a
  new source to an already-connected input replaces the previous connection.
- Combining several values into one input is always explicit, never an
  implicit side effect of wiring two sources to the same port. A node author
  opts a port into accepting multiple incoming wires (e.g. combining several
  text values); those ports grow an extra empty slot automatically as each
  slot gets wired, so there is always exactly one free slot to connect next.
  A user can also drop a dedicated **Merge** node to explicitly wait for
  several upstream branches and combine them into one value.
- Hovering a port shows its name, type, and description; wired ports offer a
  one-click disconnect. Edges can also be selected and removed with Delete.

**Editing values on a node:**

- String/number/boolean input ports show an editable control directly on the
  node body by default — no need to open the side panel or wire in a literal
  value.
- That inline control is greyed out (read-only) the moment a wire is
  connected to the port, since the wire's value is what actually gets used.
  Unwired inline fields and the node **label** are also locked while a run
  is active (`cursor-not-allowed` on disabled controls).
- Some fields (e.g. structured JSON, long text, non-primitive types) only
  ever appear in the right-hand parameter panel, not inline on the node.
- While a workflow is running, ports with a "preview" style inline field show
  the live value flowing through them instead of the design-time value.

**Reload and recover from broken custom nodes:** a toolbar action re-scans
and re-registers custom node packages; if a custom node fails to compile, the
palette reports the compilation error instead of silently dropping the node.

## Implementation Details

- Canvas rendering is built on ngDiagram; the port layout, sizing, and
  drag/connect contract (and a running incident log of past canvas bugs) is
  documented in [packages/ui/docs/DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md).
- Editor layout / feature-folder map: [packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)
  (§ Feature Structure, § Palette sidebar, § Inline editing).
- Diagram ↔ workflow graph mapping: `packages/ui/src/app/diagram/workflow-diagram.mapper.ts`;
  port id prefixing: `packages/ui/src/app/diagram/diagram-port-id.ts`; single-wire-per-input
  rule: `packages/ui/src/app/diagram/single-input-edge.ts`.
- Multi-wire ports (`multi: 'merge' | 'combine'` on a port definition) and their
  dynamic slot growth: `packages/ui/src/app/diagram/resolve-diagram-node-ports.ts`
  (`resolveNodePorts`), documented in
  [packages/ui/docs/DIAGRAM_CANVAS.md](../../packages/ui/docs/DIAGRAM_CANVAS.md)
  § Multi input ports. Dedicated combining node: `common-merge`
  (`packages/common-nodes/src/flow/merge/node.ts`), see
  [node-library.md §7.1](node-library.md#71-logic).
- Connection type-compatibility rules: `packages/shared/src/validators/connection-validator.ts`,
  enforced in `packages/ui/src/app/diagram/diagram.config.ts` (`validateConnection`).
- Palette catalog and node metadata: `packages/ui/src/app/features/palette/`;
  secondary → Advanced: [ADR-023](../ADR.md#adr-023--palette-palettesecondary--collapsed-advanced);
  reload/compile-error flow described in [docs/ARCHITECTURE.md](../ARCHITECTURE.md)
  and [spec.md](../../spec.md) §4.
- Inline vs panel field placement, port descriptors, and canvas layout timing
  background: [docs/NG_DIAGRAM.md](../NG_DIAGRAM.md), [spec.md](../../spec.md) §3.2.
- Node-authoring conventions for adding a new node to the canvas: [docs/NODES.md](../NODES.md).
