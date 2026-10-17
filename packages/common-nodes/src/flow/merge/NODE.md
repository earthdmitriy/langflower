---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/merge/**'
status: current
---

# Merge

|              |                |
| ------------ | -------------- |
| **Type**     | `common-merge` |
| **Category** | Flow           |

## Summary

Joins several wires into one. Each incoming value is forwarded as it
arrives (`multi: 'merge'`).

## Inputs

| Port    | Type | Notes                                     |
| ------- | ---- | ----------------------------------------- |
| `value` | any  | required, multi-merge (one slot per wire) |

## Outputs

| Port    | Type | Notes                       |
| ------- | ---- | --------------------------- |
| `value` | any  | passthrough of each arrival |

---

Source: [`node.ts`](./node.ts).
