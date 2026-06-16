# Entrypoints

## CLI

- `packages/cli`: Main command line interface for running workflows and managing skills.

## Server / Runtime

- The runtime is primarily driven by the `node-sdk` definitions which can be executed via the `eval` package or within a live session.

## MCP

- `packages/langflower-mcp`: Provides the bridge to Model Context Protocol, allowing Langflower nodes to act as MCP clients and servers.

## Ports

- Default ports are managed by the runtime (typically 3000+ for web-based views or specific MCP stdio streams).
