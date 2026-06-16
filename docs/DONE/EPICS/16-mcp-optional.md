# Epic 16 — MCP client / invoke (optional extension)

**Status:** landed  
**Depends on:** [01-tool-loop-builtins.md](01-tool-loop-builtins.md)  
**Index:** [README.md](README.md)  
**Mechanics:** [MECHANICS-tool-execution.md](MECHANICS-tool-execution.md) — MCP tools → **same internal** loop as builtins

## Goal

Optional MCP integration so workflows can add external tools. **Never** a
substitute for built-in `read`…`bash`. The `mcp` init port on LLM nodes binds
server refs; invoke stays inside the harness tool loop.

MCP tools **map into the same internal tool loop** as builtins (inventory +
invoke). The `mcp` port remains **init / config** (authoring), not an invoke
wire. “It is MCP” is not a reason to use per-call canvas edges. See
[MECHANICS-tool-execution.md](MECHANICS-tool-execution.md).

## Landed

1. MCP stdio client on the server (`packages/server/src/mcp/`) with
   `langflower.jsonc` `mcp.servers` + `mcp.allowlist` trust model (default deny).
2. Mapped inventory ids `mcp_<serverId>__<toolName>` via `listMcpRegistrations` /
   `harness.invoke` — same path as builtins for openai-llm / fake-llm.
3. Inspector `enabledToolIds` options include wired MCP `toolNames`
   (`common-mcp-server`; formerly `common-fake-mcp-server`).
4. Fixture: `tests/fixtures/mcp/echo-server.mjs`;
   `create-mcp-runtime.test.ts` + `openai-mcp-tool-loop.test.ts` (real stdio
   echo → openai-llm internal loop); common-nodes tool-loop covers inventory map.
5. Docs: MCP optional extension; builtins remain required for agent Status.

## In scope

- Client + invoke + allowlist + docs
- Mapping MCP tools into the internal inventory / loop from epic 01

## Out of scope

- Replacing harness builtins
- Full marketplace of MCP servers
- Graph-hosted MCP-per-call `toolCall` / `toolResult` edges
- Opt-in graph-hosted tool host (deferred; see mechanics Out of scope)

## Acceptance criteria

1. At least one fixture MCP server tool can be invoked from openai-llm via the
   internal loop (same path shape as builtins). ✅
2. use-cases README still states MCP is optional, not a prerequisite substitute. ✅

## Live verification gap (post-land)

Fixture AC used a **scripted** OpenAI stream (`tool_calls` injected), not a real
cloud/local model. Until
[TESTING.md — Live OpenAI-compatible + MCP](../../TESTING.md#live-openai-compatible--mcp-tool-calling-gap)
cases **L5–L8** (and L2 for builtins) pass on a real OpenAI-compatible provider,
do not treat MCP tool calling as end-user proven. Maintainer currently has no
cloud API access for that proof.
