# MCP http

Owns **HTTP MCP** connect/close (optional local launch). Emits a live
**`mcp-handle`** for LLM / Sub-Agent `mcp` init ports.

Handle `id` = graph node id. Server `name` = MCP `initialize` `serverInfo.name`.
Tool names come from the server `tools/list` (full inventory). Tool ids:
`<mcp_name>__<tool>`. Connect/initialize/build failure → output port **error**
(not silent `EMPTY`). Empty `url` stays inactive.

## Ports

| Direction | Port           | Wire type  | Notes                                                       |
| --------- | -------------- | ---------- | ----------------------------------------------------------- |
| In        | `url`          | string     | Streamable HTTP MCP endpoint                                |
| In        | `command`      | string     | Optional shell CLI to launch a local process before connect |
| Out       | `mcpTransport` | mcp-handle | Wire into LLM `mcp` (fan-out OK)                            |

## Trust

Wiring this node into an agent **is** permission to use it. There is no
Inspector checklist for wired MCP — remove the wire to disable.
