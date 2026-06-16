# Chat Input

|              |                     |
| ------------ | ------------------- |
| **Type**     | `common-chat-input` |
| **Category** | HITL                |
| **Mode**     | reactive            |

## Summary

Entry point for chat-style runs. It has **no wireable inputs** — the feed
composer submits a user message, which cold-starts the weakly connected
cluster (`pushIntoInput`). Plain **Run** skips clusters that contain this
node (see [workflow-execution.md](../../../../docs/features/workflow-execution.md)).

Typically wire `message` → an agent's `userPrompt`. Multi-turn continues via
Review Gate / Review **feedback** edges (ADR-016), not by reopening Chat Input
mid-run. After Stop, the idle composer returns for the next entry message.

## Inputs

| Port      | Type   | Notes                                               |
| --------- | ------ | --------------------------------------------------- |
| `message` | string | hidden HITL textarea — composer only, not on canvas |

## Outputs

| Port      | Type   | Notes               |
| --------- | ------ | ------------------- |
| `message` | string | submitted user text |

## Params

None.

## Epic

[13-chat-input.md](../../../../docs/DONE/EPICS/13-chat-input.md)
