# MCP http

Owns **HTTP MCP** connect/close (optional local launch). Emits live
**`ToolHandle[]`** on `tools` for LLM / Sub-Agent `tools` ports.

Server `name` = MCP `initialize` `serverInfo.name`. Tool names come from the
server `tools/list` (full inventory). Tool ids: `<mcp_name>__<tool>`. The live
session stays in `invoke` closures. Connect/initialize/build failure → output
port **error** (not silent `EMPTY`). Empty `url` stays inactive.

## Ports

| Direction | Port      | Wire type   | Notes                                                       |
| --------- | --------- | ----------- | ----------------------------------------------------------- |
| In        | `url`     | string      | Streamable HTTP MCP endpoint                                |
| In        | `command` | string      | Optional shell CLI to launch a local process before connect |
| Out       | `tools`   | tool-handle | Wire into LLM `tools` (fan-out OK)                          |

## Trust

Wiring this node into an agent **is** permission to use it. There is no
Inspector checklist for wired MCP — remove the wire to disable.
