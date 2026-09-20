# Finish

|              |                 |
| ------------ | --------------- |
| **Type**     | `common-finish` |
| **Category** | Output          |

## Summary

Passthrough sink with `stopsRun: true`. The first emission on a watched
output ends the run (`RuntimeRunner` finish). Wire the final result here
so Start/Stop settle instead of hanging on open work.

Live bind: `src/output/finish/node.ts`.

## Inputs

`value` (any, required)

## Outputs

| Port    | Notes                                        |
| ------- | -------------------------------------------- |
| `done`  | Hidden string `'done'`, `feed.role: result`  |
| `value` | Passthrough of the input (`feed.role: none`) |

## Notes

`stopsRun: true`, `emitOncePerActivation: true`
