# How it works (builders)

A short picture for people extending Langflower. This is not a full
architecture spec.

## Pieces you interact with

1. **CLI** — starts a local server for one project folder and opens the UI.
2. **Server** — owns the session, workflows on disk, and the live run.
3. **Runtime** — executes the graph: nodes exchange data on typed ports.
4. **UI** — canvas + feed are views of server-owned state over a WebSocket
   contract. Reconnecting the browser does not invent a second run.

## Why review “just works”

Steps are a live exchange of data. A node can wait for human input on a port
and continue when you reply. That is ordinary graph behaviour, not a bolted-on
interrupt mode.

## Hard harness

Edges and logic nodes define order. If QA or approval is on the graph, the
model cannot skip it by claiming it is finished.

## Extensibility surface

| You add…     | Where                          |
| ------------ | ------------------------------ |
| Skills       | `.langflower/skills/`          |
| Custom nodes | `.langflower/nodes/<pack>/`    |
| Workflows    | `.langflower/workflows/`       |
| Providers    | `.langflower/langflower.jsonc` |

See [Extending](extending.md) and [Configuration](configuration.md).

## Monorepo deep dives

In the Langflower source tree (not shipped here): `docs/ARCHITECTURE.md`,
`docs/EXECUTION_ARCHITECTURE.md`, and `docs/PRINCIPLES.md`.
