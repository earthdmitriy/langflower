## Responsibility

The execution engine of the system. It manages the lifecycle of nodes, handles data flow through edges (reactive ports), and orchestrates agent processing.

## Key Folders

- `src/engine`: The core loop and state management.
- `src/ports`: Logic for reactive port connections and data propagation.
- `src/agents`: Definitions and logic for autonomous agents.

## Public Contracts

- `RuntimeEngine`: Main class to start, pause, and resume execution.
- `PortSystem`: Manages the mapping of inputs/outputs between nodes.
- `AgentProcessor`: Handles the "thinking" step of an agent node.

## Neighbor Interactions

- **Runtime -> UI**: Emits state changes (e.g., "Node X is active", "Value Y updated").
- **Core Logic -> Runtime**: Provides shared types and utility functions for calculations.
- **CLI -> Runtime**: Triggers specific execution modes or manual steps.

## Pitfalls

- Circular dependencies in the graph can cause infinite loops if not handled (e.g., via depth limits).
- Asynchronous updates might lead to "flickering" if UI isn't synced correctly with the engine state.
