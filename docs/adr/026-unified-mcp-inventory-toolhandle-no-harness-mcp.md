---
kind: adr
owner: docs
covers: []
status: current
id: ADR-026
supersedes: []
superseded-by: []
package: docs
---

## ADR-026 — Unified MCP inventory (`ToolHandle[]`; no harness MCP)

**Status:** accepted · **Date:** 2026-07-23 · **Amended:** 2026-08-19

**Context:** Epic 16 wired MCP via id-only `mcp-server-config` +
`harness.listMcpRegistrations` / `wrapHarnessWithMcp`. Agents depended on
harness MCP API and could not receive a ready transport. Node-local MCP needed
the same consume path as project system servers.

**Alternatives considered:** Keep harness MCP invoke (rejected — dual protocol).
Drop jsonc system servers (rejected — authors still want project-wide MCP).
Inspector checklist for wired tools (rejected — remove the wire instead).
Author-SDK `McpHandle` wrapper (superseded — epic 41 made the canvas wire
`ToolHandle[]`; the leftover SDK type had no factory and leaked a second
handle into `@langflower/node-sdk/mcp`).

**Decision:** Live MCP session stays in client + `ToolHandle.invoke` closures
(connect/close on the MCP node or the system pool). Agents only consume
**`ToolHandle[]`** (inventory + handler invoke). There is **no** author
`McpHandle`. Harness has **no** MCP API. Agent nodes never receive MCP
server config to expand, connect, or filter. Canvas wire type is `tool-handle`
(epic 41) — not `mcp-handle`. `@langflower/node-sdk` does not export MCP types.

The system pool (`createSystemMcpHandles`) groups `ToolHandle[]` by jsonc
server id only so Inspector `enabledMcpIds` can filter per agent. That bag
(`SystemMcpServerTools`) lives in `@langflower/tools`. Inventory entries are
SDK `ToolHandle` — tools imports `@langflower/node-sdk` (no local twin).

| Source                                        | Lifecycle                                 | Agent ingress                 | Gate                                                      |
| --------------------------------------------- | ----------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Wire (`common-mcp-stdio` / `common-mcp-http`) | MCP node                                  | `tools` port (`ToolHandle[]`) | Wire only                                                 |
| Project (`langflower.jsonc` `mcp.servers`)    | Run spawn → flatten into `EC.toolHandles` | context (`ToolHandle[]`)      | Server applies Inspector `enabledMcpIds` when building EC |

Agent merges `EC.toolHandles` ∪ port `tools` (two arrays — OK; permanent dual
ingress, not a temporary compromise). `enabledMcpIds` remains on agent `params`
(Inspector) but the agent bind does **not** use it. Tools are eager
`ToolHandle[]` (no `listRegistrations`).

`mcp.servers.<id>` uses the **same connect fields** as the MCP nodes
(`kind: stdio|http`, shell `command` / `url`). No author `name`/`description`
(server name from `initialize`). No `allowlist`, no `command`+`args` shape, no
migration shims.

**Tradeoffs accepted:** (+) One protocol, fan-out 1→N, shell CLI for any
command. (−) Live `ToolHandle.invoke` closures are not JSON-serializable
(ADR-019 class); persist/replay of MCP sessions is out of scope.

**Consequences:** See [use-cases/node-local-mcp.md](../product/use-cases/node-local-mcp.md),
[CONFIG.md](../reference/CONFIG.md) § MCP, `@langflower/tools/create-system-mcp-handles`.

---
