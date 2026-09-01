# Tool invoke

|              |                      |
| ------------ | -------------------- |
| **Type**     | `common-tool-invoke` |
| **Category** | Tools                |

## Summary

Looks up one `ToolHandle` on a `tools` wire by `toolId` and calls `invoke`
with JSON `args`. No LLM. Wiring the handle **is** consent (same as MCP →
agent). Unknown id or invalid args JSON → output port **error**. Empty
inventory or empty `toolId` stays inactive (not an error) so MCP connect can
still arrive. `args` defaults to a blank string (empty textarea). `null` /
`undefined` cannot be wired. Blank args parse as `{}`.

The same `toolId` + `args` pair is not re-run when `tools` reconnects
**inside one run**. A new `args`, `toolId`, or `runId` (next Start) fires
another call. Several tools = several Invoke nodes. One incoming `tools`
edge — fan-in several packs with Tool collection first.

## Ports

| Direction | Port     | Wire type   | Notes                                                 |
| --------- | -------- | ----------- | ----------------------------------------------------- |
| In        | `tools`  | tool-handle | Single wire; no default — wait for inventory          |
| In        | `toolId` | string      | Paste from Tool inspect (`<mcp_name>__<tool>`)        |
| In        | `args`   | json        | Optional; blank default. Empty string parses as `{}`. |
| Out       | `result` | string      | `handle.invoke` text                                  |

## Graph shape

```text
MCP http.tools ──► Tool invoke.tools
String toolId  ──► Tool invoke.toolId
JSON args      ──► Tool invoke.args
Tool invoke.result ──► Preview / Assert
```
