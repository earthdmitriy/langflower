# Epic 30 — Rename `@langflower/node-definitions` → `@langflower/node-sdk`

**Status:** landed (2026-07-23)  
**Depends on:** [29-define-node-slim-sdk.md](29-define-node-slim-sdk.md)  
**Index:** [README.md](README.md)  
**Next:** [31-custom-nodes-my-nodes-contract.md](31-custom-nodes-my-nodes-contract.md)

## Goal

Rename the author SDK package to **`@langflower/node-sdk`** so the name matches
the product surface for custom-node authors. Update workspace dependencies,
imports, and docs. No behavior change beyond the rename.

## Landed notes

- Folder: `packages/node-definitions` → `packages/node-sdk`
- Package `name`: `@langflower/node-sdk`
- Export map preserved: `.`, `./llm`, `./mcp`, `./create-typed-ui-schema`
- Removed shim aggregator files `llm.ts` / `mcp.ts`; package exports now point
  at `define-llm-node.ts` and `mcp-handle.ts` directly
- Peer note documented in `packages/node-sdk/AGENTS.md`: `defineNode`-only peers
  on `@langflower/node-sdk`; reactive authors also need `rxjs` +
  `@rx-evo/stateful-observable`

## Acceptance criteria

1. No live code or active docs import `@langflower/node-definitions` (DONE/
   historical WIP may still mention the old name).
2. `defineNode` / `defineReactiveNode` / `defineToolRegistrations` resolve from
   `@langflower/node-sdk`; LLM/MCP from `@langflower/node-sdk/llm` and
   `@langflower/node-sdk/mcp`.
3. `dead-code`, `check-exports`, `verify` green.

## Verify

```bash
node build/tools/agent-run.mjs verify
```
