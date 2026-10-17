---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/checkpoint/**'
status: current
---

# Checkpoint

|              |                     |
| ------------ | ------------------- |
| **Type**     | `common-checkpoint` |
| **Category** | Flow                |

## Summary

Author-visible resume boundary. Passes `value` through. When that output
emits and a workflow session is bound, the server appends an immutable
point. Optional inline `label` is stored on that point.

## Inputs

| Port    | Type   | Notes                              |
| ------- | ------ | ---------------------------------- |
| `value` | any    | required, dynamic                  |
| `label` | string | optional inline text, default `''` |

## Outputs

| Port    | Type | Notes                                 |
| ------- | ---- | ------------------------------------- |
| `value` | any  | passthrough; `createCheckpoint: true` |

---

Source: [`node.ts`](./node.ts).
