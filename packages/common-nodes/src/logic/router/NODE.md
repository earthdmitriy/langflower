# Router

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-router` |
| **Category** | Flow            |

## Summary

Use for visual organisation of edges in complex workflows. Any number of inputs
can be connected — input ports expand dynamically.

N-канальный router: один bypass base input (`ch`) и slot-specific outputs
(`ch`, `ch@1`, ...). Per-instance channels приходят из `routerChannels`.

## Inputs

Один multi-input base port (`ch`). Дополнительные upstream branches подключаются
как slots этого input (`ch[1]`, `ch[2]`, ...); порты расширяются динамически.

## Outputs

По одному output handle на channel: `ch`, `ch@1`, ...

## Notes

Runtime IO материализуется из `bypassPorts` + edges (no separate canvas builder).

---

_Implementation removed — re-add via `defineReactiveNode` + `bind()` API._
