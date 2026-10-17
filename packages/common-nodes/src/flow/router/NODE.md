---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/router/**'
status: current
---

# Router

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-router` |
| **Category** | Flow            |

## Summary

Bypass-only canvas router. `bind` returns no inputs and no outputs.
`bypassPorts` is `{ ch: 'dynamic' }`, so channel ports grow as you wire
them.

## Inputs

None on `bind`. Channels appear through bypass ports.

## Outputs

None on `bind`. Channels appear through bypass ports.

---

Source: [`node.ts`](./node.ts).
