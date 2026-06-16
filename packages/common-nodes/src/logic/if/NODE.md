# If

|              |             |
| ------------ | ----------- |
| **Type**     | `common-if` |
| **Category** | Logic       |

## Summary

Routes `value` to output `true` or `false` from boolean `condition`.

## Inputs

`condition` (boolean, required), `value` (any, optional)

## Outputs

`true`, `false` — only the matching port emits per decision

---

_Implemented via `defineReactiveNode` + `bind()` (`src/logic/if/node.ts`)._
