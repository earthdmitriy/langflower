# Chat Input

|              |                     |
| ------------ | ------------------- |
| **Type**     | `common-chat-input` |
| **Category** | HITL                |
| **Mode**     | reactive            |

## Summary

Entry point for chat-style runs. `message` is `hidden` + editable `inline`
— on-node / inspector / composer field, no incoming handle. Prefill on the
node body or type in the feed composer. **Start** cold-starts the weakly
connected cluster (`pushIntoInput`). The typed text is stored on the node
(`inputs.message`) so Stop then Start reuses it. Plain **Run** skips
clusters that contain this node (see
[workflow-execution.md](../../../../docs/features/workflow-execution.md)).

Typically wire `message` → an agent's `userPrompt`. Multi-turn continues via
Review Gate / Review **feedback** edges (ADR-016), not by reopening Chat Input
mid-run. After Stop, the idle composer returns with the last entry message.

## Inputs

| Port      | Type   | Notes                                                  |
| --------- | ------ | ------------------------------------------------------ |
| `message` | string | `hidden` + `inline: text-multiline` — field, no handle |

## Outputs

| Port      | Type   | Notes               |
| --------- | ------ | ------------------- |
| `message` | string | submitted user text |

## Params

None.

## Epic

[13-chat-input.md](../../../../docs/DONE/EPICS/13-chat-input.md)
