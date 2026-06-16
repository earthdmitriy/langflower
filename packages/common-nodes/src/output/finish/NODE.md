# Finish

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-finish` |
| **Category** | Output          |

## Summary

Sink-нода с `stopsRun: true` — первое значение на выходе завершает run. Используется как синтетический finish-sink.

## Inputs

`value` (any, required)

## Outputs

`value` (passthroughFrom: value)

## Notes

`stopsRun: true`, `emitOncePerActivation: true`

---

_Implementation removed — re-add via `defineReactiveNode` + `bind()` API._
