# @langflower/tools

Project runtime capabilities for agent workflows: builtin harness tools, path
fence, permissions, SSRF `webFetch`, crawl persist, MCP stdio, and
**exported domain tool configs** (handlers attached on wire registrations).
Injected into `ExecutionContext` by the server (thin composer).

## Boundary

Regression gate: [`tests/unit/package-boundaries/`](../../tests/unit/package-boundaries/).

- **Owns:** builtin tool ids/schemas/handlers, domain pack **configs**
  (`CRAWL_TOOL_CONFIGS` / `MEMORY_TOOL_CONFIGS` — not listed
  by `listBuiltinRegistrations`), file/shell I/O, path sandbox, `postProcess`,
  SSRF web fetch, crawl persist, project memory store (`create-memory-store`),
  MCP stdio/HTTP **clients**, `buildMcpHandle`, `formatMcpConnectError`,
  system MCP pool (`createSystemMcpHandles`), LLM-shaped error strings.
- **Must not depend on:** server, UI, common-nodes, websocket-bridge, shared.
  May import `@langflower/node-sdk` for author types (`ToolHandle`).
- **Consumers:** `@langflower/server` (create + inject); `@langflower/common-nodes`
  pack / MCP nodes **import** helpers and attach `handler` on registrations;
  tool loops call `registration.handler` (builtins still use `ctx.harness.invoke`).
- **Growth rule:** new project-root I/O, SSRF HTTP, crawl persist, or MCP
  protocol / handle-build / system-pool code lands **here** — never under
  `packages/server/src/` or as util exports from `common-nodes`. Server only
  maps config/secrets and injects factories
  ([PRINCIPLES.md § Thin server](../../docs/architecture/PRINCIPLES.md#thin-server--do-not-grow-domain-here)).

## Public imports

```typescript
import {
	createProjectHarness,
	wrapBuiltinToolHandles,
} from '@langflower/tools/create-project-harness';
import { createWebFetch } from '@langflower/tools/create-web-fetch';
import { createCrawlContext } from '@langflower/tools/create-crawl-context';
import { createMemoryStore } from '@langflower/tools/create-memory-store';
import { createProjectFilesContext } from '@langflower/tools/create-project-files-context';
import {
	CRAWL_TOOL_CONFIGS,
	MEMORY_TOOL_CONFIGS,
} from '@langflower/tools/domain-tool-configs';
import { connectMcpStdioFromCli } from '@langflower/tools/mcp-stdio-client';
import {
	connectMcpHttpWithOptionalLaunch,
	resolveMcpHttpHeaders,
} from '@langflower/tools/mcp-http-client';
import { encodeMcpToolId, parseMcpToolId } from '@langflower/tools/mcp-tool-id';
import { buildMcpHandle } from '@langflower/tools/build-mcp-handle';
import { createSystemMcpHandles } from '@langflower/tools/create-system-mcp-handles';
import { formatMcpConnectError } from '@langflower/tools/format-mcp-connect-error';
import { runBfsCrawl } from '@langflower/tools/run-bfs-crawl';
```

`mcp-tool-id` is the **owner** of MCP inventory id encode/parse. Server
config validation imports `@langflower/tools/mcp-tool-id`. There is no
shared twin. Inspector catalogs and secret-id charset remain DAG twins
([ADR-039](../../docs/architecture/ADR.md#adr-039--dag-forced-twins-stay-copies-until-the-dag-flips)).

MCP stdio **frame parse** is a DAG twin of `@langflower/mcp`
`mcp-stdio-framing.ts` (CRLF + LF Content-Length and newline JSON). Do not
import mcp. Encode / reply-mode echo stay on the mcp server. Gate:
`src/mcp/mcp-stdio-frame-parser.parity.test.ts`. Do not restore CRLF-only
headers.

Wire MCP nodes own connect/close lifecycle; they call `buildMcpHandle` after
client connect (returns `ToolHandle[]`). System / project MCP uses
`createSystemMcpHandles` (partial connect + failures, grouped by jsonc
`serverId` for Inspector `enabledMcpIds`) injected by the server.

`@langflower/tools/html` owns crawl HTML helpers (`htmlToText`,
`extractHtmlTitle`, `extractLinks`, `isSameHost`). Graph crawl nodes import that
path — do not duplicate under `common-nodes`.

`@langflower/tools/run-bfs-crawl` owns the shared BFS crawl (`runBfsCrawl`).
Graph `common-crawl` and agent `crawl_bfs` both call it with different options
(`maxDepth` / `failureMode` / `enqueueBudget`); do not grow a second BFS under
`common-nodes`.

No `index.ts` barrel. Domain tools appear in LLM inventory **only when wired**
from `common-*-tools` nodes; invoke uses the attached `registration.handler`,
not a harness `toolId` lookup map. `wrapBuiltinToolHandles` maps builtins to
`ToolHandle[]` (omit always-deny); the server injects that list — it does not
own the wrap.

## Builtins layout

Each tool is co-located under `src/builtins/<id>/tool.ts` (registration +
invoke). The catalog composer lists them:

```text
src/builtins/
  catalog.ts          ← lists tools → ids / registrations / invokeBuiltin
  <id>/tool.ts        ← schema + handler for one builtin
```

Also: `domain/domain-tool-configs.ts`, `memory/` (`create-memory-store`),
`mcp/`, `secrets/` (`interpolatePlaceholders`, internal until MCP headers),
`create-web-fetch.ts`, `ssrf-guard.ts`, `create-crawl-context.ts`,
`permission.ts`.

Builtins: `read`, `glob`, `grep`, `edit`, `write`, `create`, `delete`, `move`,
`bash`, `ask_user`.

`bash` is default-deny (`bashEnabled: false`). `ask_user` waits on a live HITL
host (`CreateHarnessOptions.askUser`). Read-class tools accept optional
`postProcess` source `(res: string) => string`.
