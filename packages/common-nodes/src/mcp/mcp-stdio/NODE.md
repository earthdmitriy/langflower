# MCP stdio

Owns **stdio MCP** connect/close. Emits a live **`mcp-handle`** for LLM /
Sub-Agent `mcp` init ports. Agents only consume the handle — they do not
spawn or initialize MCP.

Handle `id` = graph node id. Server `name` = MCP `initialize` `serverInfo.name`.
Tool names come from the server `tools/list` (full inventory). Tool ids:
`<mcp_name>__<tool>`. Connect/initialize/build failure → output port **error**
(not silent `EMPTY`). Empty `command` stays inactive.

## Ports

| Direction | Port           | Wire type  | Notes                                    |
| --------- | -------------- | ---------- | ---------------------------------------- |
| In        | `command`      | string     | Full shell CLI (e.g. `npx ts-scan -mcp`) |
| Out       | `mcpTransport` | mcp-handle | Wire into LLM `mcp` (fan-out OK)         |

## Trust

Wiring this node into an agent **is** permission to use it. There is no
Inspector checklist for wired MCP — remove the wire to disable. System MCP from
`langflower.jsonc` is separate (Inspector **Enabled MCP**).
