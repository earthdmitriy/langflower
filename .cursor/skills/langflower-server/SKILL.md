---
name: langflower-server
description: >-
    Guides Langflower server implementation: Express static + REST escape hatches,
    WebSocket gateway (default), .langflower filesystem, node registry, esbuild
    bundling, bootstrap. Use when implementing ws-handler, services, createServer,
    or workflow bus routes.
disable-model-invocation: true
---

# Langflower Server

## Start here

1. `packages/server/AGENTS.md` — **thin server boundary (read first)**
2. `docs/PRINCIPLES.md` § Thin server
3. `docs/ARCHITECTURE.md` — API table + startup sequence
4. `docs/STATUS.md`

## Thin server (do not grow domain)

- **OK in server:** WS bridge, session/HITL, workflow CRUD, config/secrets,
  checkpoints, `buildExecutionContext` inject, thin LLM credential binds.
- **Not OK in server:** KB store, crawl/SSRF, MCP stdio, OpenAI clients, builtin
  tool handlers → put in `@langflower/tools` or `common-nodes/ai/<provider>/`.
- Do **not** recreate `packages/server/src/{kb,crawl,mcp,llm}/`.

## Patterns

- Immutable FS for `.langflower/` services: read JSON → transform → write.
- **WebSocket default** for UI commands/events; REST only for ADR-approved bulk
  escape hatches.
- localhost binding only.
- Inbound WS uses `@langflower/shared/langflower` with
  `@langflower/websocket-bridge`.
- Agent runtime: inject from `@langflower/tools` — never reimplement in server.

## Wire-up

`packages/cli/src/start-command.ts` calls `createServer` from `@langflower/server/create-server`.

## Verify

```bash
node build/tools/agent-run.mjs build-package server
npm run lint
```
