---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/delay/**'
status: current
---

# Delay

|              |                |
| ------------ | -------------- |
| **Type**     | `common-delay` |
| **Category** | Flow           |

## Summary

Passes `value` through after the inline `delay` milliseconds. Negative or
non-numeric delays are treated as `0`. Pending is stamped with
`withLoading` before the wait.

## Inputs

| Port    | Type   | Notes                          |
| ------- | ------ | ------------------------------ |
| `value` | any    | required, dynamic              |
| `delay` | number | inline milliseconds, default 0 |

## Outputs

| Port    | Type | Notes      |
| ------- | ---- | ---------- |
| `value` | any  | same value |

---

Source: [`node.ts`](./node.ts).
