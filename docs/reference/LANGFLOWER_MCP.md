---
kind: reference
owner: docs
covers:
    - 'packages/langflower-mcp/**'
status: current
---

# Langflower MCP — how to use (Cursor agents)

Dev-only MCP server (`@langflower/mcp`) so Cursor can **observe and drive a
running local Langflower instance** over the internal WebSocket bus. Not a
product API for end users.

|                           |                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **ADR**                   | [ADR-024](../adr/024-dev-mcp-control-plane-over-internal-ws-bus.md)                |
| **Package**               | [`packages/langflower-mcp/`](../../packages/langflower-mcp/AGENTS.md)              |
| **Cursor config**         | [`.cursor/mcp.json`](../../.cursor/mcp.json) — server id `langflower`              |
| **Browser / screenshots** | TBD-006 (`docs/_work/TBD.md#tbd-006--headless-ui-access-for-agents`) (not shipped) |

This is **not** the outbound MCP client used _inside_ workflows
(`common-mcp-stdio` / `common-mcp-http` / system `mcp.servers` → `ToolHandle[]`).

---

## Prerequisites

1. **Build** the MCP package (after clone or after bridge/MCP code changes):

```bash
node build/tools/agent-run.mjs build-package mcp
```

2. **Start Langflower** (server must listen before tools that need a live
   session):

```bash
npm run dev
# or: langflower start ./demo-project
```

- API / WS: `ws://127.0.0.1:4010/ws` (default)
- UI in `npm run dev`: also `http://127.0.0.1:4200`

3. **Restart the Cursor MCP server** `langflower` (or Reload Window) after
   rebuild — Cursor keeps the old `dist/` process until restart.

Prefer `node build/tools/agent-run.mjs verify` when you do **not** need a live
instance. Do not leave `langflower start` / `npm run dev` running after the
task unless the user asked ([dev-server lifecycle](../../.cursor/rules/dev-server-lifecycle.mdc)).

---

## Connect

Always start with:

| Tool               | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `ensure_connected` | Lazy connect + wait for `session.ready`. Safe to call again. |

There is **no** `wait_session_ready` tool. Do not add one: inbound
`session.ready` is a non-replaying Subject, so a second wait after
`ensure_connected` hangs.

On success: `{ "wsUrl": "ws://127.0.0.1:4010/ws", "status": "ready" }`.

Optional env / CLI (MCP process):

- `LANGFLOWER_WS_URL` or `--ws-url`
- `--port` (when URL not set)

---

## Observe (read state)

| Tool                      | When to use                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `wait_event`              | Snapshots / last cached bus frame                              |
| `get_execution_feed_tail` | Live run telemetry (prefer this during/after `runner_start_*`) |

### `wait_event`

| Arg         | Meaning                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`     | Allowlisted server→client key (e.g. `workflow.current.snapshot`)                                                                                                             |
| `mode`      | **`latest` (default)** — return last cached frame, or wait until first. **`next`** — wait for a _newer_ frame after this call (easy to hang if the stream already finished). |
| `timeoutMs` | Optional; shorter default for `mode=next`                                                                                                                                    |

Do **not** use `mode=next` on `runner.port` after the stream may have
ended — use `get_execution_feed_tail` instead.

### `get_execution_feed_tail`

Returns last N events from the **server feed projection**: last
`executionFeed.snapshot.events` plus live appends of `eventLog` kinds only
(`runner.port` — direction `'in'` / `'out'` — and `runner.done`). `status` comes from the
runner gate (`runner.snapshot` / start / interrupt / done) via
`deriveExecutionProgressStatus` — e.g. interrupt → `stopped`, natural settle →
`completed` / `failed` / …. Args: `{ "limit": 40 }`.

---

## Act (workflow + runner)

Tools are **generated** from `langflowerWsConfig` for allowlisted intents
(`workflow.*`, `workflowSession.*`, `runner.*`). Names: dots → underscores
(`workflow.load.requested` → `workflow_load_requested`).

**Not exposed:** `editor.*` (canvas mutations) — policy deny.

Typical args shape for actions:

```json
{
	"payload": {},
	"timeoutMs": 15000
}
```

Empty / no-arg intents often use `"payload": {}` or `"payload": []`
(`runner_start_requested` uses `[]` like the UI / tests).

Action tools wait for the mapped broadcast (every allowlisted intent has an
explicit entry in `intent-wait-map.ts`). Where payload fields allow it, waits
are **field-correlated** (ADR-024: no bus `requestId` for single-agent CI):
e.g. `workflow_load_requested` matches `activeWorkflow.workflowId`,
`runner_hitl_event` matches `nodeId`/`portId`, `runner_resume_requested`
races `runner.resume.started` vs `runner.resume.failed`. Resume payload is
`{ "pointId": "<uuid>" }` on the bound workflow session. Refusal codes are
`POINT_STALE`, `NO_SESSION`, `BUSY`, `CORRUPT`, `UNSUPPORTED_VALUE`, and
`NOT_FOUND`. There is no checkpoint snapshot or checkpoint-discard tool.
`workflowSession.*` actions wait on `workflowSession.current.snapshot`
(delete waits on `workflowSession.list.snapshot`) and race
`workflowSession.action.failed` (`RUN_ACTIVE`, `DIRTY_WORKFLOW`,
`SESSION_BOUND`, `NOT_FOUND`, `CORRUPT`, `WRITE_FAILED`). Select, replace,
write, and discard correlate on `sessionId`; discard also requires the
`pointId` to be gone. Create uses the next current snapshot. Intents with empty
payloads (`list` / `save` / `create` / `interrupt`) still use **next broadcast
wins**. For `runner_start_*`, pass an explicit `runId` in the tuple when a UI
tab may also start runs — otherwise the wait cannot filter. Bus-wide
`requestId` is won't-do unless multi-agent same-session races need it.

### Common actions

| Tool                               | Payload sketch                                                           |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `workflow_list_requested`          | `{ "payload": {} }`                                                      |
| `workflow_load_requested`          | `{ "payload": { "workflowId": "fake-llm" } }`                            |
| `workflowSession_create_requested` | `{ "payload": {} }`                                                      |
| `workflowSession_select_requested` | `{ "payload": { "sessionId": "<uuid>" } }`                               |
| `runner_start_requested`           | `{ "payload": [] }`                                                      |
| `runner_interrupt_requested`       | `{ "payload": "cancel" }`                                                |
| `runner_hitl_event`                | `{ "payload": { "nodeId": "…", "portId": "approve", "payload": true } }` |
| `runner_permission_reply`          | `{ "payload": { "runId", "askId", "decision": "allow" \| "deny" } }`     |
| `runner_askUser_reply`             | `{ "payload": { "runId", "askId", "text" } }`                            |

HITL port ids depend on the node (e.g. review gate: `approve`,
`requestChanges`). Discover node ids from `workflow.current.snapshot` or the
feed.

---

## Example loop

```text
1. ensure_connected
2. wait_event { event: "workflow.current.snapshot", mode: "latest" }
3. runner_start_requested { payload: [] }
4. get_execution_feed_tail { limit: 40 }   # poll until HITL / done
5. runner_hitl_event { payload: { nodeId, portId, payload } }
6. get_execution_feed_tail / wait_event runner.snapshot
```

---

## After changing the bridge

1. Edit [`langflower-bus-config.ts`](../../packages/shared/src/langflower-bus-config.ts)
   (and policy globs in `packages/langflower-mcp/src/mcp-exposure-policy.ts` if
   needed).
2. `node build/tools/agent-run.mjs build-package shared`
3. `node build/tools/agent-run.mjs build-package mcp` (runs codegen)
4. Restart Cursor MCP `langflower`

Allowlisted new `workflow.*` / `runner.*` intents appear as tools automatically
after rebuild + MCP restart.

---

## Knowledge-base MCP (`langflower-kb`)

Separate stdio server, `build/tools/kb-mcp.mjs`, registered in `.mcp.json`. It
needs no running Langflower. It reuses the `hello-embed` pack
(`lib/search.ts`, `lib/ingest.ts`) and the same sqlite index
(`.langflower/.cache/hello-embed/kb.sqlite`) as the `kb-*` workflows, so
in-product agents and coding agents share one index.

| Tool        | Use                                                           |
| ----------- | ------------------------------------------------------------- |
| `kb_search` | Hybrid vector + FTS5 search; returns path, heading, full text |
| `kb_ingest` | Wipe and rebuild the index (minutes); run after docs change   |

Embeddings call an OpenAI-compatible server (LM Studio). Set env vars before
launching the agent: `KB_EMBED_MODEL` (required), `KB_EMBED_API_KEY` (LM Studio
token), optional `KB_EMBED_BASE_URL` (default `http://localhost:1234/v1`) and
`KB_SQLITE_PATH`. Text prefixes `query: ` / `passage: ` mirror
`common-embed-provider`; the index must be built with the same model and
prefixes it is searched with.

## Security / trust

- Localhost only; same power as any WS client on the machine (no auth).
- Dev tooling for this monorepo — not a stable public remote API.
- Do not expand to `editor.*` without an explicit policy/ADR decision.

---

## Stdio framing

`@langflower/mcp` accepts both **Content-Length** (MCP SDK; CRLF or LF
header ends) and **newline JSON** (Cursor host / `@langflower/tools`
mcp-stdio-client). Replies use the **same framing as the last inbound
message** — do not force Content-Length-only responses (Cursor initialize
will hang). After changing framing code, rebuild MCP and **restart** the
Cursor MCP server `langflower`. Parse dialect is pinned against the tools
client by `mcp-stdio-frame-parser.parity.test.ts` (DAG twins; do not merge
packages).

## Troubleshooting

| Symptom                                       | Likely cause                              | Fix                                                 |
| --------------------------------------------- | ----------------------------------------- | --------------------------------------------------- |
| `ensure_connected` timeout                    | Server not on 4010, or stale MCP process  | `npm run dev` / `langflower start`; restart MCP     |
| CallMcpTool: `no elements in sequence` / hang | Stale MCP without Content-Length framing  | Rebuild `@langflower/mcp`, restart MCP `langflower` |
| Tools missing new intents                     | Stale `dist/`                             | Rebuild `@langflower/mcp`, restart MCP              |
| `wait_event` hangs                            | `mode=next` on finished stream            | Use `mode=latest` or `get_execution_feed_tail`      |
| Empty feed                                    | Connected after run ended / never started | Start run; poll feed while `status: running`        |
| Hit wrong HITL port                           | Guessed `portId`                          | Read gate node from graph + feed `input-received`   |
