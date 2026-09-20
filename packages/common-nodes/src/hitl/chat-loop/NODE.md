# Chat Loop

|              |                    |
| ------------ | ------------------ |
| **Type**     | `common-chat-loop` |
| **Category** | HITL               |
| **Mode**     | reactive           |

## Summary

Mid-run human turn for an infinite agent chat. Wire the agent's `response`
into `result`; wire `feedback` back into the agent's `feedback`. The composer
opens when `result` arrives; **Send** emits the reply. There is no Approve
port — the run ends on **Stop**.

Cold-start still uses [Chat Input](../chat-input/NODE.md). Do not set
`chatEntry` on this node.

## Inputs

| Port      | Type   | Notes                                                            |
| --------- | ------ | ---------------------------------------------------------------- |
| `result`  | string | required; agent turn; opens the composer                         |
| `message` | string | hidden HITL textarea (`Send`, `role: reply`); no incoming handle |

## Outputs

| Port       | Type   | Notes                                       |
| ---------- | ------ | ------------------------------------------- |
| `feedback` | string | human reply; wire to the agent's `feedback` |

## Params

None.
