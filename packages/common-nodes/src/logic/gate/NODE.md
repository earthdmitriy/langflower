# Gate

|              |               |
| ------------ | ------------- |
| **Type**     | `common-gate` |
| **Category** | Logic         |

## Summary

Forwards `value` only when `pass === true`; otherwise emits nothing (soft block).

## Inputs

`pass` (boolean, required), `value` (any)

## Outputs

`value` (passthroughFrom: value)

---

_Implemented via `defineReactiveNode` + `bind()` (`src/logic/gate/node.ts`)._
