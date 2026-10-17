---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/flow/repeat/**'
status: current
---

# Repeat

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-repeat` |
| **Category** | Flow            |

## Summary

Repeats wired `value` `count` times. The first copy is immediate; later
copies wait for `trigger`. After the last value, the next pace slot emits
`done` and no further value. `index` counts from 0. The cursor
(`nextIndex`, `done`, `count`) is a state hook so the next Run continues
remaining slots instead of starting at 0. An invalid restored cursor
returns `{ ok: false }` and starts fresh.

## Inputs

| Port      | Type   | Notes                            |
| --------- | ------ | -------------------------------- |
| `value`   | any    | required, dynamic                |
| `count`   | number | inline, min 1, step 1, default 1 |
| `trigger` | any    | required pace pulse              |

## Outputs

| Port    | Type    | Notes                                   |
| ------- | ------- | --------------------------------------- |
| `value` | any     | one copy per remaining slot             |
| `index` | number  | slot index from the cursor              |
| `done`  | boolean | `true` on the slot after the last value |

---

Source: [`node.ts`](./node.ts).
