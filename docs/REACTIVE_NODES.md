# Reactive nodes

Langflower nodes are authored with `defineReactiveNode` from
`@langflower/node-sdk` (see
[packages/node-sdk/AGENTS.md](../packages/node-sdk/AGENTS.md)).

See also: [EXECUTION_ARCHITECTURE.md](EXECUTION_ARCHITECTURE.md),
[`packages/runtime/ADR.md`](../packages/runtime/ADR.md).

## `defineReactiveNode` lifecycle

| Phase    | API                                         | Result                                       |
| -------- | ------------------------------------------- | -------------------------------------------- |
| Author   | `defineReactiveNode({ bind, uiSchema, … })` | Reactive definition                          |
| Probe    | `bind(probeCtx, helpers)`                   | Port metadata; probe connections discarded   |
| Instance | `definition.getInstance()`                  | Fresh live inputs, outputs, and context port |

`defineReactiveNode` intentionally calls `bind` twice across the definition
lifecycle:

1. At definition time, a probe call collects `inputsConfigs` and
   `outputsConfigs` for the registry and palette. Its connections are discarded.
2. For every canvas node, `getInstance()` calls `bind` again with a fresh hidden
   context connection and returns the live `StatefulConnection` /
   `StatefulObservable` graph.

Keep `bind` free of module-level I/O and shared mutable state: such work would
run for the discarded probe and again for every instance. Instance-local state
may be closed over inside `bind`.

**Authoring how-to:** [HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md).
Author examples:
`packages/node-sdk/src/node-factory/define-reactive-node/test/samples/`.

## Instance lifetime and cross-run state

`getInstance()` runs **once per canvas node** while that workflow stays loaded
in the session. `done` / `interrupt` only tear down **run wiring**
(`disconnect`, run subscriptions) — they do **not** dispose node instances or
re-call `bind`.

Nodes may **intentionally** keep internal state across runs (counters,
closures, once-per-instance streams) for the life of the loaded workflow:

| Event                                          | Instance / intentional state                         |
| ---------------------------------------------- | ---------------------------------------------------- |
| `done` → `idle` or `interrupt` → `stopped`     | Kept — same `RuntimeNode` ports and closures         |
| Next `start` / `startNode` on the same graph   | Same instances; state still available if authored so |
| Load another workflow / rematerialize graph    | Fresh `getInstance()` — state discarded              |
| Remove / re-add the canvas node                | Fresh instance                                       |
| Shut down Langflower / kill the server process | Gone (not durable). Use checkpoints for disk resume  |

This is **in-memory session state**, not checkpoint resume. Durable continue
after process restart remains explicit Checkpoint nodes
([ADR-018](ADR.md#adr-018--durable-workflow-checkpoints)).

Regression: `packages/runtime/src/testing/workflows/share-replay-rerun.workflow.test.ts`
(passthrough buffer + counter across finish → second start).

## Runtime model

| Concept        | Current runtime                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port values    | `StatefulObservable.value$` / `StatefulConnection` relays                                                                                           |
| Edge wiring    | `RuntimeEditor.addEdge` + `connection.connect(source)` on run start                                                                                 |
| Run completion | Empty graph, first watched output from a `stopsRun` node, or active-run `completeRun()` → `done`; active-run `interrupt('cancel')` → `stopped`      |
| Port telemetry | WS `runner.output-emitted` / `runner.input-received` (`state: 'pending' \| 'value' \| 'error'`); UI derives per-node chrome from output-port states |
| Node instances | Persist in `RuntimeEditor` across runs until workflow rematerialize / node remove / process exit                                                    |

A graph without a reachable `stopsRun` output remains running until interrupt.
This explicit lifecycle is what keeps interactive feedback graphs alive between
turns; there is no idle-settle completion heuristic.

## Port telemetry and working state

The runtime observes `StatefulObservable` status in the dataflow path and emits
port telemetry. `inactive` on disconnect/reset is not a telemetry event.

| Event                                         | Meaning                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `runner.output-emitted`                       | `{ nodeId, portId, state: 'pending' \| 'value' \| 'error', value }` |
| `runner.input-received`                       | `{ nodeId, portId, state: 'pending' \| 'value' \| 'error', value }` |
| `runner.started` / `runner.startNode.started` | Run (or partial run) began                                          |
| `runner.done` / `runner.interrupted`          | Run completed or stopped                                            |

The UI derives node/wire presentation from these port states. Multi-value ports
may emit repeatedly during one run; `value` means a value arrived, not that the
port can never emit again. Feed behavior belongs in
[features/feed-panel.md](features/feed-panel.md).

## StatefulObservable semantics and demand

- Inputs are `StatefulConnection`s; outputs are `StatefulObservable`s.
- Port status is part of the data stream: **inactive / loading / value /
  error**. Runtime telemetry (`runner.output-emitted` /
  `runner.input-received`) mirrors those states — including errors — so the UI
  can show failure without a synthetic success value.
- `pipeValue` transforms successful values while preserving inactive, loading,
  and error states. Use `statefulObservable({ input, loader })` when the loader
  is genuinely asynchronous or multi-step, not for a simple identity/map.
- **Fail visibly:** when a node must refuse further work (cap, validation,
  unrecoverable I/O), error the `StatefulObservable` cycle. Do not emit fake
  placeholder values to clear loading, and do not drop the refusal with bare
  `EMPTY` (Soft↔Hard looked “dead”). Details:
  [LLM_NODES.md](LLM_NODES.md) § Port events. Runner telemetry unwraps
  `combineStatefulObservables` error tuples (`false` = no source error; may
  nest) to a human-readable message for feed/WS.
- Outputs run only when demanded by an edge or by the runtime's unwired-output
  driver. Keep dependencies explicit in the returned output graph.
- If a control stream reads another input indirectly, expose an explicit
  passthrough output when that input must stay demanded. Configure it with the
  input connection and `inferTypeFrom`; do not hide the dependency behind
  `withLatestFrom`.
- Follow [REACTIVITY.md](REACTIVITY.md) for fold, subscription, and
  `withLatestFrom` rules instead of duplicating them here.

## LLM feedback turns

LLM-class nodes separate initialization from feedback:

- `userPrompt` — initial run
- `feedback` — re-run when Review or Review Gate emits feedback
- `tools`, `mcp`, and other inventory ports — initialization inputs

Build initialization with `combineInputs`; optional inventory inputs use
`defaultValue` so the combine can start while unconnected. Do not place
`feedback` in that combine. Only the feedback-turn stream uses
`startWith('')` to prime turn 0 and `concatMap` to queue later feedback while
the current turn is streaming. See
[HOW_TO_WRITE_REACTIVE_NODES.md](HOW_TO_WRITE_REACTIVE_NODES.md).

## Review node (`common-review`)

Review exists to **choose the next graph path**, not only to emit critique text.
A normal agent/`common-openai-llm` with one `response` cannot do that.

Outputs:

- **`response`** — Accept path (passthrough of reviewed `result`) — wire onward
  (Finish, next stage, outer Review)
- **`feedback`** — Revise path — wire to agent `feedback` (`NEVER` on accept)

Same shared inventory as other LLM-class nodes (`tools` / subagents via
`defineLlmNode`) — Review is a full agent **plus** path-routed control tools,
not a yes/no stub. See [LLM_NODES.md](LLM_NODES.md) § Review.

Human twin: **`common-hitl-review-gate`** (approve → `response`, request-changes
→ `feedback`) in
[features/node-library.md](features/node-library.md#53b-hitl-review-gate--common-hitl-review-gate).

## HITL and graph lock

While a run is active or waiting for HITL:

- `LangflowerSession.isGraphLocked()` reflects the runner's `running` status
  (topology / inputs / position edits are disabled). Panel `params` always
  patch the session document without runtime rebind (next-run ctx seeds).
- The editor **composer** (bottom of the right sidebar) renders one control per
  input port with `config.hitl`; when several nodes await at once they are
  grouped behind a tab strip (see [features/hitl-chat.md](features/hitl-chat.md)
  § HITL UI surface). The work-log timeline stays a pure execution history.
- **`approve` / `deny` / `retry` / `requestChanges` are separate input ports** —
  not actions inside a single HITL config. UI/server never emit outputs directly;
  they send `runner.hitl.event` → `RuntimeRunner.pushIntoInput({ nodeId, portId, payload })`.
- Node handlers route injected input values to the appropriate outputs.

Types: `packages/node-sdk/.../hitl-config.ts`. Reference nodes:
`common-hitl-review-gate`, `common-chat-input`.

Interactive feedback graphs normally have no `stopsRun` sink and therefore end
through user Stop → `RuntimeRunner.interrupt(...)`.

## Stateful observables inside node handlers

Instance-local state across input values should remain inside the stream fold.
Prefer immutable accumulators and pure operators; see
[REACTIVITY.md](REACTIVITY.md).

Example sketch (not shipped):

```typescript
const lines$ = events.pipeValue(
	scan((lines, line) => [...lines, line], [] as readonly string[]),
);
```

For multi-port state, combine explicit input streams first, then fold an
immutable object with `scan`. Never use module-level buffers: the probe bind
would share or mutate state before a live instance exists.
