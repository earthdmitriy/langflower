# Project Layout

## Tree Structure

- `packages/cli`: Command line interface for running workflows and managing skills.
- `packages/common-nodes`: A comprehensive library of reusable nodes (AI, Flow, Logic, Text, Crawl, MCP).
- `packages/compiler`: The engine that validates, resolves types, and compiles node definitions into executable formats.
- `packages/eval`: Tools for evaluating workflow performance, scoring cases, and loading packs.
- `packages/langflower-mcp`: Implementation of the Model Context Protocol (MCP) bridge, allowing Langflower to interact with external tools.
- `packages/node-sdk`: The core SDK for defining custom nodes (Reactive, LLM, MCP, etc.) and providing a factory pattern for node creation.

## Package Ownership

- **Core Logic**: `compiler`, `eval`
- **Node Library**: `common-nodes`
- **User Interface / CLI**: `cli`, `langflower-mcp`
- **Extensibility SDK**: `node-sdk`
