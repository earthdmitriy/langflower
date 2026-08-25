# How it works (builders)

A short picture for people extending Langflower. This is not a full
architecture spec.

## Pieces you interact with

1. **CLI** — starts a local server for one project folder and opens the UI
   in your existing browser (not a bundled Electron shell).
2. **Runtime** — wires **reactive nodes**. Ports are independent: a node can
   receive on one input and emit on one output at any time.
3. **Node SDK** — public contract (`@langflower/node-sdk`). Built-in
   **common nodes** and custom packs use the same SDK.
4. **Server** — composes those pieces, compiles user-defined node packs, and
   owns the live run.
5. **UI** — thin browser client. Canvas + feed listen to WebSocket events
   from the server. Closing the tab does not stop the run; reopen and the
   server catches the UI up.

## Why review “just works”

Steps are a live exchange of data. A node can wait for human input on a port
and continue when you reply. That is ordinary graph behaviour, not a bolted-on
interrupt mode.

## Hard harness

Edges and logic nodes define order. If QA or approval is on the graph, the
model cannot skip it by claiming it is finished.

## Extensibility surface

| You add…     | Where                                                        |
| ------------ | ------------------------------------------------------------ |
| MCP          | Palette MCP nodes + optional `mcp` in JSONC                  |
| Skills       | `.langflower/skills/`                                        |
| Custom nodes | `.langflower/nodes/<pack>/` — processing or ToolHandle tools |
| Workflows    | `.langflower/workflows/`                                     |
| Providers    | `.langflower/langflower.jsonc`                               |

See [Extending](extending.md) and [Configuration](configuration.md).

## Monorepo deep dives

In the Langflower source tree (not shipped here): `docs/ARCHITECTURE.md`,
`docs/EXECUTION_ARCHITECTURE.md`, and `docs/PRINCIPLES.md`.
