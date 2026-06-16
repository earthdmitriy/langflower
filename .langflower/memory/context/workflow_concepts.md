# Workflow Concepts

## Hard Harness vs. Soft Harness

- **Hard Harness**: A strictly defined sequence of operations where the output of one step is the direct input to the next (e.g., a linear pipeline). It provides high predictability and structure.
- **Soft Harness**: A more flexible, loosely coupled set of components that can interact dynamically. This allows for branching, merging, and parallel execution with multiple possible paths.

## Human-in-the-Loop Checkpoints

Checkpoints are specific points in the workflow where the automated process pauses to wait for human input, validation, or modification. These can range from simple "Approve/Reject" buttons to complex text edits and parameter adjustments.

## Visual Canvas Concepts

The canvas is the primary workspace where workflows are visualized. It serves as a spatial representation of logic, allowing users to see the relationships between components at a glance, similar to a node-based editor or a flow chart.
