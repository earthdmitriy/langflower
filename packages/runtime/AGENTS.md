---
kind: guide
owner: runtime
covers:
    - 'packages/runtime/**'
status: current
---

# @langflower/runtime

Executable graph for a workflow run: `RuntimeFacade` splits into an editor
and a runner. Public contracts live in `src/types.ts`.

## Boundary

Regression gate: [`tests/unit/package-boundaries/`](../../tests/unit/package-boundaries/).

- **Owns:** `RuntimeFacade`, `RuntimeEditor`, `RuntimeRunner`, port and graph
  types, bypass-port ids, feed-log fold, and port-error normalization.
- **Must not:** depend on server, UI, common-nodes, tools, shared,
  websocket-bridge, or node-sdk. Do not own node author factories, project
  I/O, or the WebSocket transport.
- **Consumers:** `@langflower/server` and `@langflower/ui` run the facade.
  `@langflower/shared` and `@langflower/common-nodes` may import runtime
  types. `@langflower/node-sdk` may depend on runtime only as a
  devDependency for parity tests.
- **Growth rule:** graph and runner behaviour lands here. Author factories
  stay in `@langflower/node-sdk`. Project I/O stays in `@langflower/tools`.
  WS attach stays in `@langflower/server`.

## Where to read

- [Execution architecture](../../docs/architecture/EXECUTION_ARCHITECTURE.md)
- [ADR-042](../../docs/adr/042-runtime-editor-runner.md) — editor/runner split
