# Canvas node status folding

Per-node canvas chrome from bridge execution facts. Unlike `feed-folding`

(global nested timeline), each consumer asks for one node and the fold

**filters first**:

```text

bridge events → filter(nodeId) → append-only fold → status$

              → filter(nodeId, out, value DTO) → valuePulseActive$ → pulse$

```

```ts
const { status$, pulse$ } = canvasNodeStatus.getNodeStatusEvents(nodeId);
```

Factory results are cached per `nodeId` (`shareReplay`). There is no global

all-nodes status map.

## Boundary — dual HITL folds

Composer HITL and canvas chrome HITL are **intentionally separate**:

| Fold | Owner | Purpose |

| ------------ | ----------------------------- | -------------------------------------------- |

| Composer HITL | `ComposerService` + `features/composer/execution-hitl-fold.ts` | Tabs, optimistic soft Pause, idle chat-entry |

| Chrome HITL | this feature (`fold-canvas-node-hitl.ts`) | Node ring `hitl` from port events + palette |

```text

❌ WES → CanvasNodeStatusService

❌ CanvasNodeStatusService → WES

❌ WES → ComposerService

✅ ComposerService → WES (run gate, live graph, labels)

✅ LfNode ring/pulse ← factory only

✅ Composer tabs ← ComposerService.hitlTriggeredNodeIds only

```

Chrome HITL is simplified: no optimistic open/resolve, no idle chat-entry,

no permission asks (composer owns those).

## Status rules

| Priority | Status | Rule |

| -------- | ---------- | -------------------------------------------------------------------- |

| 1 | `hitl` | Chrome HITL await for this node (port events + palette meta) |

| 2 | `error` | Any output `error` |

| 3 | `value` | Any **non-streaming** output with `'value' in` ResponseDto (green) |

| 4 | `pending` | Any other seen event (input, `{ pending: true }`, streaming value) — amber |

| 5 | `inactive` | No events in the current run |

New `input-received` clears settled green (`hasNonStreamingValue`) so feedback
loops and re-activations return to `pending` (amber).

Streaming resolution: `event.feed.streaming === true`, else palette

`feed.streaming`. Streaming-only nodes **stay amber** after run done/interrupt

(unfinished-work cue).

## Hard rule — append-only

Live frames for that node fold O(1). Full rebuild only on

`executionFeed.snapshot` (node-filtered), clear, catalog change, or new-run

reset.

## Out of scope

- Edge chrome (`WorkflowExecutionService.wireStatus` / raw port states)

- Composer HITL tabs / idle chat-entry / permission UI (`ComposerService`)

- Selected / hover (diagram + `NodeHoverService`; CSS cascade overrides status)

## Files

| File | Role |

| -------------------------------------------- | ----------------------------------------- |

| `types.ts` | Contracts |

| `operators/canvas-node-status-projection.ts` | Single-node append / replay / fold status |

| `operators/canvas-node-hitl-projection.ts` | Single-node chrome HITL await |

| `fold-canvas-node-status.ts` | `foldSingleNodeCanvasStatus(nodeId, …)` |

| `fold-canvas-node-hitl.ts` | `foldSingleNodeHitlAwaiting(nodeId, …)` |

| `canvas-node-status.service.ts` | Bridge + factory cache |
