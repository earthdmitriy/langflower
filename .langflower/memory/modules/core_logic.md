## Responsibility

The backbone of the project. It contains shared types, common node definitions (e.g., Start, End, Merge), and utility functions used by both UI and Runtime.

## Key Folders

- `src/types`: Shared TypeScript interfaces and types.
- `src/nodes`: Base node classes and standard implementations.
- `src/utils`: Helper functions for math, string manipulation, and graph traversal.

## Public Contracts

- `Node`: The base interface for all nodes in the system.
- `GraphState`: The complete snapshot of the current graph structure.
- `UtilityFunctions`: Exported helpers like `calculateDistance`, `formatOutput`.

## Neighbor Interactions

- **Core Logic -> UI**: Provides the data structures that the UI renders.
- **Core Logic -> Runtime**: Supplies the base types and common nodes used during execution.

## Pitfalls

- Changing a core type can have ripple effects across all modules; use careful versioning or naming.
- Avoid putting too much logic into `utils`—keep them pure and focused.
