# Assert

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-assert` |
| **Category** | Logic           |

## Summary

Hard harness gate: if `condition` !== `true`, the node fails with `message`;
otherwise passthrough `value`.

## Inputs

`condition` (boolean, required), `message` (string, default `"Assertion failed"`),
`value` (any, optional passthrough)

## Outputs

`value` (passthroughFrom: value) — only on success

## Runtime contract

- Failure surfaces as output `error` (`throwError`) → downstream skip unless
  wired from a success branch (IF / Switch / Gate).

---

_Implemented via `defineReactiveNode` + `bind()` (`src/logic/assert/node.ts`)._
