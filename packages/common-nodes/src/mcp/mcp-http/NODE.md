# MCP http

Owns **HTTP MCP** connect/close (optional local launch). Emits live
**`ToolHandle[]`** on `tools` for LLM / Sub-Agent `tools` ports.

Server `name` = MCP `initialize` `serverInfo.name`. Tool names come from the
server `tools/list` (full inventory). Tool ids: `<mcp_name>__<tool>`. The live
session stays in `invoke` closures. Connect/initialize/build failure → output
port **error** (not silent `EMPTY`). Empty `url` stays inactive.

Optional `headers` is JSON (object or string). Values may include
`{lf_secrets:ID}` or `{env:VAR}`. Default `''` so the textarea does not show
`[object Object]`. Protocol headers (`content-type`, `accept`,
`MCP-Protocol-Version`, `Mcp-Session-Id`) win over author keys. Missing secret
or invalid JSON → port error.

## Ports

| Direction | Port      | Wire type   | Notes                                                            |
| --------- | --------- | ----------- | ---------------------------------------------------------------- |
| In        | `url`     | string      | Streamable HTTP MCP endpoint                                     |
| In        | `command` | string      | Optional shell CLI to launch a local process before connect      |
| In        | `headers` | json        | Optional HTTP headers JSON; interpolate at connect. Default `''` |
| Out       | `tools`   | tool-handle | Wire into LLM `tools` (fan-out OK)                               |

## Trust

Wiring this node into an agent **is** permission to use it. There is no
Inspector checklist for wired MCP — remove the wire to disable.
