# Tool inspect

|              |                       |
| ------------ | --------------------- |
| **Type**     | `common-tool-inspect` |
| **Category** | Output                |

## Summary

Formats a `tool-handle` wire into copy-paste text: one block per tool with
`toolId`, description, example `args` JSON (placeholders / `default` /
first `enum`), then the full `inputSchema` (field descriptions, `enum`,
`required`). `invoke` is never printed. Empty / unwired inventory →
`No tools on this wire.` (not a port error). Optional inline **toolId**
keeps matching handles only (exact id/name or substring, case-insensitive);
empty filter dumps the whole pack. Unmatched filter →
`No tools matching «…».` Duplicate `toolId` last-wins; junk values are
skipped. One incoming `tools` edge — fan-in several packs with Tool
collection first.

The on-node Preview pane does not fill (value is an **output**). Read the
work-log result bubble, or wire `text` into Preview.

## Ports

| Direction | Port     | Wire type   | Notes                                    |
| --------- | -------- | ----------- | ---------------------------------------- |
| In        | `tools`  | tool-handle | Single wire (`ToolHandle` or pack array) |
| In        | `toolId` | string      | Inline filter; empty = all tools         |
| Out       | `text`   | string      | Dump for Preview / feed (`role: result`) |

## Graph shape

```text
MCP http.tools ──► Tool inspect.tools
String toolId  ──► Tool inspect.toolId   (optional filter)
Tool inspect.text ──► Preview
MCP http.tools ──► Tool invoke.tools
```
