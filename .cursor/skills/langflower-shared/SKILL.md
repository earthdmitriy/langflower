---
name: langflower-shared
description: >-
    Guides edits to @langflower/shared domain types and validators. Use when adding
    DataType, WorkflowGraph, NodeDefinition, ToolConfig, canConnectPorts,
    langflower-bus-config, or importing shared types from server/UI.
disable-model-invocation: true
---

# Langflower Shared

## Scope

`packages/shared` — types, validators, constants. No framework code.

## Public API

No `src/index.ts` barrel. Export concrete modules through `package.json` `exports`.

## Key files

| File                                 | Purpose                               |
| ------------------------------------ | ------------------------------------- |
| `types/data-type.ts`                 | Port `DataType` union                 |
| `types/workflow.ts`                  | `WorkflowGraph`, nodes, edges         |
| `types/node-definition.ts`           | Node metadata, `DefinedNodeConfig`    |
| `define-node.ts`                     | `defineNode`, `extractNodeDefinition` |
| `validators/connection-validator.ts` | `canConnectPorts`                     |
| `langflower-bus-config.ts`           | Internal typed WS bus registry        |
| `langflower.ts`                      | Public bus config export              |

## Rules

- `readonly` on all object shapes.
- No `any`. Align with `spec.md` §4–5 before extending types.
- **WebSocket:** bus typing lives in `langflower-bus-config.ts`; runtime types may
  define payload shapes by design. Add service-boundary guards where raw transport
  payloads cross into runtime, filesystem, or UI state.
- Do not add HTTP, Angular, or Express imports.

## Verify

```bash
node build/tools/agent-run.mjs build-package shared
npm run lint
```

See `packages/shared/AGENTS.md`.
