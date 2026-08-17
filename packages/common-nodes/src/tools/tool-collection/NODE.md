# Tool collection

|              |                          |
| ------------ | ------------------------ |
| **Type**     | `common-tool-collection` |
| **Category** | Tools                    |

## Summary

Optional hub: fans in many `ToolHandle[]` wires and emits **one** merged
array. Agents already accept `tools` **multi: combine** — this node is visual
QOL, not required.

Duplicate `toolId` **last-wins** (later combine slot), same rule as
`collectAgentToolHandles`. Skip junk (non-handle values); do not throw.
Unwired / empty slots → `[]`.

A late MCP connect still merges (`multi: 'combine'`, not zip).

## Ports

| Direction | Port    | Wire type   | Notes                                              |
| --------- | ------- | ----------- | -------------------------------------------------- |
| In        | `tools` | tool-handle | **multi combine**; packs / MCP / Sub-Agent handles |
| Out       | `tools` | tool-handle | Flattened `ToolHandle[]` → agent `tools`           |

Same port id in vs out is intentional.

## Graph shape

```text
Memory Tools.tools ──┐
MCP.tools           ─┼─► Tool collection.tools ──► LLM.tools
Writer.tools        ──┘
```

Direct pack → LLM `tools` still works without this node.
