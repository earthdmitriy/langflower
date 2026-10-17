---
kind: guide
owner: common-nodes
covers:
    - 'packages/common-nodes/src/text/concat/**'
status: current
---

# Concat

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-concat` |
| **Category** | Text            |

## Summary

Joins wired strings with `separator`. Emits only when every wired string
has a fresh value (`multi: 'zip'`). The two characters `\` and `n` in the
separator become a line break. Default separator is `\n`.

## Inputs

| Port        | Type     | Notes                              |
| ----------- | -------- | ---------------------------------- |
| `separator` | string   | required inline, default `\n`      |
| `value`     | string[] | required multi-zip of string wires |

## Outputs

| Port    | Type   | Notes          |
| ------- | ------ | -------------- |
| `value` | string | joined strings |

---

Source: [`node.ts`](./node.ts).
