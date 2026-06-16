# Merge

|              |                |
| ------------ | -------------- |
| **Type**     | `common-merge` |
| **Category** | Flow           |

## Summary

Forwards every value arriving on the multi-input `value` port, individually, as it
arrives (flatten). Does not wrap values in an array — each source value is passed
through to the output `value` port as it emits.

## Inputs

`value` (multi-slot, `multi: 'merge'`, any) — multiple incoming edges are
flattened into one stream.

## Outputs

`value` (any) — passthrough of the flattened input stream.

## Runtime contract

- `merge` mode flattens wired slots: each source value is forwarded individually
  (`merge(...sources.map(s => s.value$))`), interleaving across slots.
- v1 forwards **success values only**; error / loading / inactive propagation via
  `raw$` is a TODO (needs an `@rx-evo` merge-of-`raw$` primitive).

---

_Implemented via `defineReactiveNode` + `bind()` (`src/flow/merge/node.ts`)._
