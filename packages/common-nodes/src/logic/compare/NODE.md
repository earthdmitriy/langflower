# Compare

|              |                  |
| ------------ | ---------------- |
| **Type**     | `common-compare` |
| **Category** | Logic            |

## Summary

Compares `a` and `b` with panel operator (`eq`, `ne`, `lt`, `gt`, `lte`, `gte`,
`contains`, `matches`) → boolean `result`.

## Inputs

`a`, `b` (any, required)

## Outputs

`result` (boolean)

## Panel

`op` (select) — comparison operator

---

_Implemented via `defineReactiveNode` + `bind()` (`src/logic/compare/node.ts`)._
