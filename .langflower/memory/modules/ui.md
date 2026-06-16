## Responsibility

Handles the visual representation of the graph, including node rendering, edge connections, and user interaction (zoom, pan, select). It translates abstract graph data into a tangible canvas for the user.

## Key Folders

- `src/components`: Individual UI elements like Nodes, Edges, and Controls.
- `src/canvas`: The main workspace where nodes are positioned and rendered.

## Public Contracts

- `GraphCanvas`: Main component managing the viewport.
- `NodeRenderer`: Functionality to draw specific node types.
- `InteractionHandler`: Manages mouse/touch events (drag, drop, click).

## Neighbor Interactions

- **UI -> Runtime**: Sends selection events and manual updates (e.g., "Move Node X").
- **Runtime -> UI**: Provides the current state of the graph to be rendered.

## Pitfalls

- High node counts can impact rendering performance; consider using a virtualized canvas or spatial indexing.
- Ensure z-index consistency so edges don't overlap nodes awkwardly.
