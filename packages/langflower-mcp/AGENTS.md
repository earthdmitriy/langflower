# @langflower/mcp

Dev-only **stdio MCP server** so Cursor (and similar hosts) can observe and
drive a **running** local Langflower instance over the internal WS bus
([ADR-024](../../docs/architecture/ADR.md#adr-024--dev-mcp-control-plane-over-internal-ws-bus)).

**Agent how-to:** [docs/LANGFLOWER_MCP.md](../../docs/LANGFLOWER_MCP.md)
(connect, observe, run, HITL, troubleshooting).

## Boundary

- **Owns:** MCP stdio handshake, exposure policy, codegen of tool meta from
  `langflower-bus-config.ts`, wait/correlation for broadcast intents
  (`intent-wait-map.ts` + `intent-wait-predicate.ts` field predicates).
- **Must not:** grow server domain logic; start/stop Langflower by default;
  expose `editor.*` canvas mutations (policy deny).
- **Depends on:** `@langflower/shared` (`langflowerWsConfig`, waits, feed /
  runner snapshot payload types), `@langflower/websocket-bridge`
  (`createClient`). No direct `@langflower/runtime` — runner event/status
  types come from shared payload indexed aliases (`runtime-event-types.ts`).
- **Not** the outbound MCP client used inside workflow runs
  (`common-mcp-stdio` / `common-mcp-http` / jsonc `mcp.servers`).

## Usage (short)

1. Start Langflower: `langflower start ./demo-project` (or `npm run dev`).
2. Cursor MCP entry (see repo `.cursor/mcp.json`) runs `langflower-mcp`.
3. Call `ensure_connected`, then generated `workflow_*` / `runner_*` tools.
4. For run telemetry prefer `get_execution_feed_tail` over
   `wait_event(mode=next)`.

Do **not** add a `wait_session_ready` tool. `ensure_connected` already
waits once; a second `waitSessionReady` on the hot `session.ready`
Subject hangs (BUG-2026-07-14).

Stdio accepts **Content-Length** (CRLF and LF header ends) and **newline JSON**;
replies echo the peer's last inbound framing (Cursor host uses newline).
The parse path is a DAG twin of `@langflower/tools` `mcp-stdio-frame-parser.ts`
— do not import tools here. Parity:
`packages/tools/src/mcp/mcp-stdio-frame-parser.parity.test.ts`.

Env / flags:

- `LANGFLOWER_WS_URL` or `--ws-url` (default `ws://127.0.0.1:4010/ws`)
- `--port` (overrides port when URL not set)

After rebuild: restart the Cursor MCP server `langflower`.

## Auto-expose

Allowlisted client→server keys (`workflow.*`, `runner.*`) become tools after
`npm run build -w @langflower/mcp` (codegen + `Object.keys` reflection). Expand
or shrink surface in `src/mcp-exposure-policy.ts` only.

## Headless UI

Playwright / screenshots: [TBD-006](../../docs/TBD.md#tbd-006--headless-ui-access-for-agents).
