# Conventions

## TypeScript

- Strict mode enabled.
- Prefer `readonly` for immutable data structures.
- Use functional programming patterns where appropriate (e.g., `.map`, `.filter`).

## Errors

- Use the `Results` pattern or explicit error types for complex node outputs.
- Error propagation should be clear through ports.

## Modules

- No "barrel" files (`index.ts`) unless they significantly simplify imports.
- Prefer named exports over default exports for better tree-shaking and clarity.

## Reactivity / Agents

- Nodes are reactive by nature; state changes propagate through the graph.
- Sub-agents can be nested within nodes to handle complex sub-tasks.
