---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/hitl/review-gate/**'
status: current
---

# Review Gate

|              |                           |
| ------------ | ------------------------- |
| **Type**     | `common-hitl-review-gate` |
| **Category** | HITL                      |

## Summary

Pauses for a human. `approve` (hidden button, payload `true`) emits the
reviewed `result` on `response`. `requestChanges` (hidden textarea) emits
the feedback text on `feedback`. Both outputs wait with `withLoading` and
take one HITL value. `response` sets `rewireFrom: 'result'` so deleting
the gate continues the reviewed value. Feed role on both outputs is
`none`.

## Inputs

| Port             | Type                  | Notes                                           |
| ---------------- | --------------------- | ----------------------------------------------- |
| `result`         | string                | required text under review                      |
| `approve`        | boolean               | hidden HITL Approve button                      |
| `requestChanges` | `string \| user-turn` | hidden HITL feedback textarea; may attach files |

## Outputs

| Port       | Type                  | Notes                                                               |
| ---------- | --------------------- | ------------------------------------------------------------------- |
| `response` | string                | `result` after Approve                                              |
| `feedback` | `string \| user-turn` | text from Request changes; a user turn only when files are attached |

---

Source: [`node.ts`](./node.ts).
