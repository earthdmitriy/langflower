---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/hitl/chat-loop/**'
status: current
---

# Chat Loop

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-chat-loop` |
| **Category** | HITL               |
| **Mode**     | reactive           |

## Summary

Mid-run human turn for an infinite agent chat. Wire the agent's `response`
into `result`; wire `feedback` back into the agent's `feedback`. The
composer opens when `result` arrives; **Send** emits the reply, including
any attached files. There is no Approve port — the run ends on **Stop**.

Cold-start still uses [Chat Input](../chat-input/NODE.md). Do not set
`chatEntry` on this node.

## Inputs

| Port      | Type   | Notes                                                            |
| --------- | ------ | ---------------------------------------------------------------- |
| `result`  | string | required; agent turn; opens the composer                         |
| `message` | string | hidden HITL textarea (`Send`, `role: reply`); no incoming handle |

## Outputs

| Port       | Type    | Notes                                                  |
| ---------- | ------- | ------------------------------------------------------ |
| `feedback` | `string | user-turn`                                             | human reply (a string unless files are attached); wire to the agent's `feedback` |
| `text`     | string  | the reply string, for string consumers such as Preview |

## Params

None.
