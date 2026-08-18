# Runtime v2 specification

Status: **prototype** — no backward-compatibility guarantees; API may break freely.

Replaces the run-centric v1 model (`WorkflowRuntime`, `HitlChannel`, per-run
materialization) with a **persistent StatefulObservable graph** and
{@link Runtime} class.

Related:

- v1 contracts: [`../contracts.ts`](../contracts.ts), [`../workflow-runner.ts`](../workflow-runner.ts)
- Product execution docs: [`docs/REACTIVE_NODES.md`](../../../../docs/REACTIVE_NODES.md)
- v1 refactor plan: [`docs/TODO/runtime-refactor.md`](../../../../docs/TODO/runtime-refactor.md)
- **ADR — run until stopped:** [`ADR.md`](./ADR.md)

---

## 1. Goals

1. **Reactive-first** — execution is wiring between `StatefulObservable` ports;
   sync/promise/reactive node handlers all expose the same port surface (later).
2. **Thin runtime** — no HITL gateway, no WebSocket, no `WorkflowGraph`
   loader in Phase 1; HITL uses ordinary input ports.
3. **Observable-native async** — no runner-level `waitForUserInput` /
   `resumeUserInput` / `interrupt({ kind: 'hitl' })`.
4. **Server as adapter** — subscribe to `events$`, map to WS; mark HITL ports
   and chat semantics above runtime.
5. **Duplicated validation** — edge rules enforced in runtime, UI, and server
   (fail fast at each layer).

Primitive: [`@rx-evo/stateful-observable`](https://www.npmjs.com/package/@rx-evo/stateful-observable).

---

## 2. Scope

### In scope (`@langflower/runtime` v2)

| Area                  | Responsibility                                                                   |
| --------------------- | -------------------------------------------------------------------------------- |
| Graph editor API      | Add/remove nodes and edges while idle                                            |
| Edge validation       | Port exists, slot in range, wire-type match                                      |
| Run control           | `start`, `startNode`, `pushIntoInput`, `interrupt`, `dispose`                    |
| Wiring                | Subscribe output ports → input slots for active scope                            |
| Telemetry             | `status$`, `events$` with `runId`                                                |
| Seed / external input | Push values into open single input slots via `initialPayload` or `pushIntoInput` |

### Out of scope (server or later phases)

| Area                                    | Owner                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `WorkflowGraph` → `RuntimeNode` factory | Later; Phase 1 = **isolated runtime**                                             |
| `defineNode` sync/promise lift          | Later                                                                             |
| HITL / chat UX                          | Server — port metadata + WS mapping; runtime only accepts payloads on input ports |
| Harness, LLM, filesystem                | Server                                                                            |
| Run persistence                         | Server                                                                            |
| WebSocket protocol                      | Server translates `events$`                                                       |

Phase 1 builds an **isolated runtime**: tests wire `RuntimeNode` instances
manually; no Langflower workflow loader.

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────┐
│ @langflower/server                                      │
│  HITL port map · WS bridge · WorkflowGraph loader (later)│
│  subscribes: runtime.events$ → execution.* WS frames    │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Runtime (v2) — graph + runner in one class                   │
│  nodes / edges maps · connect/disconnect on start/interrupt   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ Node handlers (defineReactiveNode, later defineNode)    │
│  RxJS pipelines · catchError · port error$              │
└─────────────────────────────────────────────────────────┘
```

**Dependency direction:** server → runtime v2 types; runtime v2 does not import
server or UI.

---

## 4. Core types

Public contracts live in [`types.ts`](./types.ts).

### 4.1 `RuntimeNode`

A node registered in the editor with **already bound** handler observables.

| Field         | Type                                 | Notes                                                 |
| ------------- | ------------------------------------ | ----------------------------------------------------- |
| `nodeId`      | `string`                             | Stable id                                             |
| `inputs`      | `Record<string, SubjectLike[]>`      | Write side — runtime pushes via `.next()`             |
| `outputs`     | `Record<string, StatefulObservable>` | Read side — runtime subscribes                        |
| `bypassPorts` | `Record<string, RuntimeWireType>`    | Router bypass base port id → wire type (factory meta) |

#### Input vs output asymmetry

Earlier drafts used `StatefulObservable` on inputs, which left **no write API**
for runtime (seed, edge forward, server HITL reply). Inputs now expose RxJS
`SubjectLike` so the runner can push values into nodes.

```text
Node factory                         Runtime (on start / edge)
────────────                         ─────────────────────────
Subject ──► handler input Observable   subject.next(value)
                                         subject.complete()  (acyclic terminal)

Output StatefulObservable ◄── handler    subscribe value$ / state$
```

Each input slot: factory creates a `Subject` (or equivalent), registers the
`SubjectLike` on `RuntimeNode.inputs`, and passes the derived `Observable` to
the reactive handler.

**Output port naming (`StatefulObservable.name`):**

- `nodeId.portId.wireType`

Input wire types are **not** read from `SubjectLike`; the editor stores port
metadata on `addNode` (including `bypassPorts` base-port wire types for router
channels).

**Input cases:**

1. Single port — `inputs[portId].length === 1`, slot `0`
2. Multi port — one slot per wired edge; UI adds slots below
3. No inputs — source / bootstrap node (needs seed on `start`)

**Multi-input merge / combine / zip:** multi-input ports have one of three modes
(set via `InputParams.multi`):

- `merge` — wires are flattened: each source value is forwarded individually as
  it arrives (`merge(...sources.map(s => s.value$))`), interleaving across slots.
  v1 forwards **success values only**; error/loading/inactive propagation via
  `raw$` is a TODO (needs an `@rx-evo` merge-of-`raw$` primitive).
- `combine` — wires are combined into a `combineLatest` **array**
  (`combineStatefulObservables(sources, v => v)`), emitted once every slot has
  a value; later, any single slot re-fire re-emits with sibling last values.
- `zip` — wires are combined with RxJS `zip` into an **array**: emit only when
  every wired slot has delivered a **new** success value (flush after emit).
  Used by `common-concat`.

### 4.2 `RuntimeEdge`

```typescript
{
	edgeId: string;
	fromNodeId: string;
	fromPort: [portId, slotIndex];
	toNodeId: string;
	toPort: [portId, slotIndex];
}
```

No `bypass` flag. Router bypass lanes use normal edges:

- one base input port from `bypassPorts` (for example `ch`) materialized as a
  multi-input;
- derived output channel handles (`ch`, `ch@1`, ...) materialized as slot views
  over that input.

### 4.3 `RuntimeSeedPortValue`

```typescript
{
	portId: string;
	slotIndex: number; // 0 for single-slot ports
	value: unknown;
}
```

Used by `start` / `startNode` to push into input port slots before evaluation.

### 4.4 `RuntimeRunnerStatus`

| Value     | Meaning                          | Editor mutations |
| --------- | -------------------------------- | ---------------- |
| `idle`    | No active run, or natural `done` | Allowed          |
| `running` | Active run                       | **Rejected**     |
| `stopped` | Cancelled via `interrupt`        | Allowed          |

**Lifecycle:**

```text
idle ──start/startNode/pushIntoInput──► running ──done──► idle
running ──interrupt──► stopped ──start──► running
```

- `start` / `startNode` **throw** if status is already `running`.
- `pushIntoInput` starts a scoped run when idle/stopped, or injects into the
  active run scope when running.
- `done` sets status to `idle`.
- `interrupt('cancel')` sets status to `stopped` (does not dispose graph).

---

## 5. `RuntimeEditor`

Graph structure API. Same object (or paired factory) as runner — TBD at impl.

| Method                                          | Behaviour                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `addNode`                                       | Register node + ports; fail if `running`                           |
| `addEdge`                                       | Validate + connect; `false` if duplicate or invalid                |
| `removeNode` / `removeEdge`                     | Fail if `running`                                                  |
| `getNode` / `getEdge` / `getNodes` / `getEdges` | Query                                                              |
| `getAll`                                        | Serialization snapshot (topology only; observables not serialized) |

### Edge validation (minimal)

On `addEdge`, return `false` when:

- Unknown `fromNodeId` / `toNodeId`
- Unknown `portId` on source outputs or target inputs
- `slotIndex` out of range for target input array
- Wire-type mismatch (output: `StatefulObservable.name`; input: editor port
  metadata registered on `addNode`)

Router bypass follows the same validation rules, with one addition: the base
input lives in `inputs`, while derived channel outputs may be materialized
lazily from `bypassPorts` during `addEdge`.

Same rules are duplicated in UI (`canConnectPorts`) and server — intentional.

---

## 6. `RuntimeRunner`

### 6.1 `start(initialPayload?) → runId`

1. Return `false` if `status === 'running'`.
2. Assign `runId` (e.g. `crypto.randomUUID()`) and set `status$` → `'running'`
   **synchronously**. Lock the editor.
3. **Empty graph:** emit instant `done` → `idle` (editor unlock) on the same
   stack. No deferred wiring.
4. Return `runId` **before** any `in` / `out` telemetry so callers can emit
   `runner.started` on the same stack (server: `start()` then
   `bridgeEmit('runner.started')`).
5. On a **microtask**, wire **all edges** and watch **all nodes** (full scope),
   then apply `initialPayload` (seed open input slots via `connect(of(value))`).
   `interrupt` / `dispose` cancel a pending wire so a stopped run does not
   connect.
6. Port telemetry on `events$` begins only after that microtask.

`startNode` and `resume` share the same `runScope` deferral.

Run stays `'running'` until {@link RuntimeRunner.interrupt} or a
{@link RuntimeNode.stopsRun} node emits. See [`ADR.md`](./ADR.md).

Returns `runId` for server correlation. Runtime does not store run history.

### 6.2 `startNode(nodeId, initialPayload?) → runId`

Run-from-node semantics: wire only the **weakly connected cluster** containing
`nodeId` (orphan nodes elsewhere are ignored). Same run-until-stopped rules as
`start`.

### 6.3 `pushIntoInput({ nodeId, portId, payload }) → runId | false`

HITL-style entrypoint for user/external input:

1. If status is `idle` or `stopped`, resolve the weakly connected cluster
   containing `nodeId`, run it like `startNode(nodeId)`, and deliver `payload`
   to `portId`.
2. If status is `running`, deliver `payload` only when `nodeId` is inside the
   active run scope.
3. Reuse the same runtime-created input source for repeated pushes into the same
   open single input during one run.
4. Return the active/new `runId` when accepted; return `false` when the target
   node/port is missing, out of scope, multi-input (`merge` / `combine`), or
   already occupied by an edge/seed. This is intentional: push owns one
   run-scoped `Subject` on a single slot — not fan-in wiring. Callers that
   need HITL-style injection (including ADR-032 soft Pause on LLM
   `steerControl`) MUST author that port as **`single`**, not `multi: 'merge'`.

Accepted payloads emit the same `input-received` telemetry as normal edge and
seed delivery. The created input source is disconnected and completed during
`interrupt`, `done`, or `dispose` teardown.

### 6.4 `interrupt(reason: 'cancel')`

1. Unsubscribe active run wiring.
2. Set `status$` → `'stopped'`.
3. Do **not** remove nodes/edges from editor.

Only `'cancel'` today — no runner-level pause/HITL interrupt kinds.

### 6.5 `dispose()`

Tear down editor + runner subscriptions. Terminal.

### 6.6 `status$`

Hot observable of `RuntimeRunnerStatus`. UI and server may subscribe to gate
canvas edits and session state.

### 6.7 `events$` and `eventLog`

**Primary live telemetry bus.** Server subscribes at run start and maps to
WebSocket execution frames. Production UI does not depend on runtime directly.

- **`events$`** — hot {@link Subject}; subscribers receive only events emitted
  **after** subscribe. No replay of past frames.
- **`eventLog`** — debug buffer; populated only when {@link Runtime} is created
  with `{ log: true }`. Default: empty, never written. Not for production.

Event union (`RuntimeRunnerEvent`):

| `kind`           | Payload                                                        | When                                                                   |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `output-emitted` | `['out', nodeId, portId, ResponseDto, portIdx, edgeIds, feed]` | Output port activity                                                   |
| `input-received` | same shape                                                     | Input slot activity                                                    |
| `done`           | `runId`                                                        | Empty graph instant completion, or {@link RuntimeNode.stopsRun} output |

`ResponseDto` (from `@rx-evo/stateful-observable`): `{ value } | { pending: true } | { inactive: true } | { error }`.

---

## 7. Wiring semantics

### 7.1 Edge wiring (`connect` / `disconnect`)

For each edge in scope during a run:

```text
to.inputs[toPortId][toSlotIndex].connect(from.outputs[fromPortId])
```

On {@link RuntimeRunner.interrupt} or natural `done`:

```text
to.inputs[toPortId][toSlotIndex].disconnect()
```

Teardown disconnects wiring and unsubscribes run demand only. It does **not**
remove nodes from the editor or re-create port graphs. Node authors may keep
intentional instance-local state across runs for the life of the loaded graph
(until workflow rematerialize or process exit). Regression:
`src/testing/workflows/share-replay-rerun.workflow.test.ts`.

Input ports are {@link StatefulConnection} instances from
`statefulConnection()`. Output ports are {@link StatefulObservable}. Seeds on
open slots use `connect(of(value))`; `pushIntoInput` uses a run-owned
`Subject` connected to the same input for repeated external pushes.

Emit `input-received` / `output-emitted` on `events$` when port activity
changes.

### 7.2 Run completion

**Default:** run stays `'running'` until {@link RuntimeRunner.interrupt}.

**Natural completion (`done` → `idle`):**

1. **Empty graph** on `start()` — instant `done` so the editor unlocks.
2. **Finish node** — {@link RuntimeNode} with `stopsRun: true`; first **value**
   on a watched output ends the run.

`emitOncePerActivation` on a node is declarative handler metadata (constant,
delay); runtime does **not** auto-complete on that flag.

See [`ADR.md`](./ADR.md).

### 7.3 Loop / hot-input graphs

When a feedback cluster is run via `startNode` or `pushIntoInput`:

- Wire the **whole cluster** containing the anchor node.
- Run stays `'running'` until `interrupt` or a in-scope `stopsRun` node.

HITL and infinite hot inputs behave similarly: no implicit `done`; server or
finish node decides session completion.

### 7.4 Errors

Errors flow through RxJS inside node handlers and port `error$`
(`catchError`, `throwError`, etc.).

Wiring telemetry (`output-emitted`) still reports `state: 'error'` on the
source node. After that tap, the runner drops `ResponseError` so edges do not
forward error chrome to downstream nodes (unlike v1
`propagateUpstreamFailure`, which skipped whole subgraphs).

---

## 8. Router and `bypassPorts`

Router nodes expose passthrough channels with one base multi-input and
slot-specific output handles:

1. Factory declares a single bypass base port, e.g.
   `bypassPorts: { ch: 'dynamic' }`.
2. `RuntimeEditor.addNode` materializes `inputs.ch` as `ch.dynamic.multi` and
   `outputs.ch` as slot `0` passthrough.
3. `RuntimeEditor.addEdge` lazily materializes derived outputs (`ch@1`,
   `ch@2`, ...) when they are used as source handles.
4. Upstream edges target the base input with slot indexes:
   `toPort: ['ch', 0]`, `toPort: ['ch', 1]`, ...
5. Downstream edges read channel outputs by handle:
   `fromPort: ['ch', 0]`, `fromPort: ['ch@1', 0]`, ...

`addEdge` remains atomic: if validation fails, lazily materialized router
outputs are rolled back and the editor graph is unchanged.

---

## 9. HITL and chat (server semantics above runtime)

Runtime has **no HITL gateway or chat state**. It only exposes
`RuntimeRunner.pushIntoInput` as a generic input-port entrypoint; server and UI
decide which ports are HITL and what the payload means.

Server layer:

1. Declares which ports are HITL (node definition metadata or config).
2. Maps `events$` frames to chat / WS UI.
3. Injects user replies via `pushIntoInput({ nodeId, portId, payload })`.

Ask-user / approval nodes become ordinary reactive ports; waiting is implemented
inside the node Observable pipeline, not via `HitlChannel`.

---

## 10. Phase 1 deliverables

1. **`Runtime`** — graph + runner in one class.
2. **Test nodes** — `testing/nodes/` (constant, delay, combine, hitl, agent).
3. **Workflow tests** — `testing/workflows/*.workflow.test.ts` (graph setup
   is local to each file; bootstrap + topology patterns).
4. **Unit tests** — `runtime.test.ts`, `testing/nodes/*-node.test.ts`,
   `testing/workflows/*.workflow.test.ts`.

---

## 11. Open items (non-blocking)

| Item                                             | Notes                                          |
| ------------------------------------------------ | ---------------------------------------------- |
| Single factory vs split editor/runner objects    | Impl detail                                    |
| Exact `complete` forward on `StatefulObservable` | Follow package API                             |
| Loop cluster detection algorithm                 | Reuse ideas from v1 `graph-scope.ts`           |
| `getAll()` serialization shape                   | Topology only; no live observables             |
| Stream port chunk policy on `events$`            | One event per value emission; no replay        |
| `eventLog` debug buffer                          | `{ log: true }` on {@link Runtime} constructor |

---

## 12. Type reference

See [`types.ts`](./types.ts) for the authoritative TypeScript definitions:

- `RuntimeRunnerStatus`
- `PortTelemetry` / `ResponseDto`
- `RuntimeRunnerEvent`
- `RuntimeWireType`
- `RuntimeSeedPortValue`
- `RuntimeNode`
- `RuntimeEdge`
- `RuntimeEditor`
- `RuntimeRunner`
