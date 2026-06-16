# @langflower/server

Express static shell + **event-driven WebSocket bridge** on
`langflowerWsConfig` (`@langflower/shared/langflower`).

## Boundary — keep this package thin

Regression gate: [`tests/unit/package-boundaries/`](../../tests/unit/package-boundaries/).

Server is **transport + project wiring + secrets**. It must **not** grow domain
implementations for agent runtime, KB, crawl, MCP, or LLM providers.

| Server may own                                              | Server must **not** own                                   |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| WS bridge / session / HITL pause-reply                      | Builtin tool handlers, path fence, `postProcess`          |
| Workflow CRUD, palette, bootstrap                           | KB store / chunk / embed / search                         |
| Config + credential resolve                                 | SSRF policy, `webFetch`, crawl page persist               |
| Checkpoints under `.langflower/runs/` (explicit boundaries) | MCP stdio client / tool inventory merge                   |
| Skills read under `.langflower/skills/`                     | OpenAI (or other) HTTP client adapters                    |
| `buildExecutionContext` **composer** (inject only)          | Re-implementing factories that belong in tools/nodes      |
| Thin binds (`bind-llm-context.ts`)                          | New `src/kb/`, `src/crawl/`, `src/mcp/`, `src/llm/` trees |

**Placement rule (agents):** before adding a file under `packages/server/src/`,
ask “is this WS/session/config/secrets, or is it project runtime / provider
logic?” If the latter → put it in `@langflower/tools` or
`@langflower/common-nodes` and **inject** from
[`bridge/build-execution-context.ts`](src/bridge/build-execution-context.ts).

Normative ownership: [ADR-014](../../docs/ADR.md#adr-014--project-root-harness-io),
[PRINCIPLES.md § Thin server](../../docs/PRINCIPLES.md#thin-server--do-not-grow-domain-here).

All application network I/O goes through `@langflower/websocket-bridge`.
HTTP serves the UI shell only.

## Entry

No `index.ts` — import concrete modules via `package.json` exports:

```typescript
import { createServer } from '@langflower/server/create-server';
import { bootstrapProject } from '@langflower/server/bootstrap';
import { createServerContext } from '@langflower/server/server-context';
```

- `createServer({ projectDir, port?, uiDistPath? })`
- `bootstrapProject(projectDir, { mode?: 'create' | 'force', seedCustomNodes?: boolean })`
- `hasLangflowerProject(projectDir)` — CLI first-run gate
- `createServerContext(projectDir)` — test / advanced wiring

## Layout

```
src/
├── bridge/                          # WS transport + ctx composer
│   ├── attach-langflower-bridge.ts  # ENTRY — subscription order
│   ├── build-execution-context.ts   # inject harness/kb/crawl/llm binds
│   ├── bind-llm-context.ts          # secrets → common-nodes openai factories
│   ├── wire-*-handlers.ts
│   └── …
├── harness/pending-permission-asks.ts  # WS permission HITL only
├── checkpoint/
├── bootstrap/
├── config/
├── session/
├── skills/
├── workflow/
├── palette/
└── create-server.ts
```

**Forbidden layout (do not recreate):** `src/kb/`, `src/crawl/`, `src/mcp/`,
`src/llm/` for domain logic. Those lived here once and were moved out.

Call stack / intent map: [`src/bridge/BRIDGE.md`](src/bridge/BRIDGE.md).

Handler and service code: follow [PRINCIPLES.md](../../docs/PRINCIPLES.md)
(helpers must shrink call sites — inline trivial one-liners;
[§ Composer entry points](../../docs/PRINCIPLES.md#composer-entry-points);
[§ Functional error handling](../../docs/PRINCIPLES.md#functional-error-handling)
— expected failures return `{ ok: false, message }`, do not throw).

## Build

```bash
node build/tools/agent-run.mjs build-package server
```
