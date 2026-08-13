# Specification: Compact bridge frame format

**Status:** done  
**Index:** [README.md](README.md)

## 1. Executive Summary & Intent

- **Problem Statement:** Port telemetry and bridge frames use verbose **object** shapes with repeated keys (`kind`, `runId`, `nodeId`, …) on every high-frequency tick. The same inflated objects appear on WebSocket **and** in NDJSON logs (logs add another wrapper on top). Streaming runs emit thousands of `runner.output-emitted` frames — key names and redundant discriminators dominate payload size.
- **User Prompt Source:**
    - One shared compact format for WS and logs (no split schemas).
    - Omit `runId`, omit `kind` — use short `'in'` / `'out'` (port direction: input received vs output emitted).
    - **Tuples instead of objects** — positional arrays, no property names on the wire or in source types.
    - Drop legacy log keys: **`schemaVersion`** (noise — remove from bridge event log entirely), `kind: 'frame'`, `scope`, long `direction`.
- **External Context:** [`packages/runtime/src/types.ts`](../../packages/runtime/src/types.ts) lines 131–172, [`langflower-bus-config.ts`](../../packages/shared/src/langflower-bus-config.ts), [`bridge-codec.ts`](../../packages/websocket-bridge/src/bridge-codec.ts).

## 2. Codebase Guardrails & Local Alignment

- **Designated Base Folder:** `packages/runtime/src/types.ts` — compact tuple **is** the source type; bus and codec use it as-is (no mirror module).
- **Target Directories:**
    - `packages/runtime/src/types.ts` — replace object port events with tuple types
    - `packages/shared/src/langflower-bus-config.ts` — bus payload types = runtime tuples (as-is)
    - `packages/websocket-bridge/src/bridge-types.ts`, `bridge-codec.ts`, `bridge-guards.ts` — `BridgeFrame` tuple + transport guards only
    - `packages/server/src/bridge/` — emit tuples end-to-end
    - `packages/ui/src/app/features/feed-folding/`, `packages/ui/src/app/services/*-fold.ts`, canvas folds — migrate off `.kind` / `.runId` field access
    - `tests/integration/ws/`, MCP, `docs/ADR.md`
- **Architectural Patterns & Boilerplates Enforced:**
    - **Compact source types:** tuple aliases in `types.ts` **are** the domain shape — no parallel wire DTO, no accessor/glue module ([PRINCIPLES.md § No adapters, no glue code](../../docs/PRINCIPLES.md#no-adapters-no-glue-code), [shared AGENTS.md](../../packages/shared/AGENTS.md) — bus uses runtime types as-is).
    - **One format, two sinks:** identical JSON array on WS and in `.langflower/logs/` — same bytes, same shape; no log-only transform or sanitization pass.
    - **Named tuple indices:** TypeScript labels on tuple slots (`portDir`, `nodeId`, …) document positions; call sites destructure or index directly — no `portDir()` / `readPortValue()` shim layer.
    - **`runId` is session-scoped:** carried on `runner.snapshot`, `executionFeed.snapshot`, `runner.started` — **not** on each port tuple.
    - **Hard cutover — no legacy path:** delete object codec, old bus types, and envelope wrappers in the same change ([PRINCIPLES.md § Delete obsolete code immediately](../../docs/PRINCIPLES.md#delete-obsolete-code-immediately)). No rollback flag, dual codec, or temporary compatibility shim.
    - Co-versioned breaking change — ADR required ([`packages/shared/AGENTS.md`](../../packages/shared/AGENTS.md)).
- **Pattern & Boilerplate Reference Baseline:**
    - [`types.ts`](../../packages/runtime/src/types.ts) 131–172 — **replace** `RuntimeOutputEmittedEvent` / `RuntimeInputReceivedEvent` objects.
    - [`forward-runner-event.ts`](../../packages/server/src/bridge/forward-runner-event.ts) — forward tuple as-is.
    - [`fold-port-events.ts`](../../packages/ui/src/app/features/feed-folding/fold-port-events.ts) — migrate `event.kind` checks → destructuring / `event[0] === 'in'|'out'`.
    - [`ExecutionFeedSnapshotPayload`](../../packages/shared/src/types/langflower-bootstrap.ts) — `events` array holds tuples; top-level snapshot `runId` unchanged.
- **Third-Party Dependencies & Packages:** None.
- **Environment Configuration (ENV):** None.

## 3. Deep System Mechanics & System Analysis

### A. Blast Radius & Impact Assessment

- **Affected Modules / Components:** Runtime types + runner emit path, shared bus config, WS codec, server log, **all** port-event consumers (feed, canvas chrome, execution folds, MCP, integration tests, runtime tests).
- **Affected Files Inventory:**
    - **New Files:**
        - ADR in `docs/ADR.md`
    - **Changed Files:**
        - `packages/runtime/src/types.ts` — compact tuple source types (see §B); tail assembly stays at emit sites
        - `packages/runtime/src/runtime-runner.ts` — build and emit tuples inline (no builder module)
        - `packages/runtime/src/testing/workflows/workflow-events.ts` — test fixtures as tuples
        - `packages/shared/src/langflower-bus-config.ts` — payload types reference runtime tuples as-is
        - `packages/websocket-bridge/src/bridge-types.ts` — `BridgeFrame` tuple type
        - `packages/websocket-bridge/src/bridge-codec.ts`, `bridge-guards.ts` — tuple frame codec + transport guards
        - `packages/server/src/bridge/bridge-event-log.ts` — drop `BridgeEventLogRecord.schemaVersion` and all writes of `schemaVersion: 1`; append `BridgeFrame` tuples directly (see § Remove `schemaVersion` from bridge event log)
        - `packages/server/src/bridge/bridge-event-log.test.ts` — no assertions on `schemaVersion`
        - `packages/server/src/bridge/forward-runner-event.ts`
        - All UI folds/services referencing `event.kind`, `event.runId`, `event.nodeId`, …
        - `packages/langflower-mcp/` execution feed helpers
        - Integration WS tests
    - **Deleted Files:**
        - `RuntimeOutputEmittedEvent` / `RuntimeInputReceivedEvent` **object** type definitions — replaced by tuple alias (no legacy object alias kept).
        - `BridgeEventLogRecord` type and `write()` wrapper that injects `schemaVersion` + `timestamp` into a separate object envelope — replaced by `BridgeFrame` tuple append.

#### Remove `schemaVersion` from bridge event log

`schemaVersion: 1` on every NDJSON line is **noise** — single-version bridge logs do not need a per-line version stamp. Remove it **everywhere** in the bridge event log path (not checkpoint persistence — that is a separate on-disk contract in `workflow-checkpoint-store.ts` and stays out of scope).

| Location                                                                          | Current                                                      | Action                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [`bridge-event-log.ts:18`](../../packages/server/src/bridge/bridge-event-log.ts)  | `readonly schemaVersion: 1` on `BridgeEventLogRecord`        | **Delete** field from type                                              |
| [`bridge-event-log.ts:179`](../../packages/server/src/bridge/bridge-event-log.ts) | `Omit<BridgeEventLogRecord, 'schemaVersion' \| 'timestamp'>` | **Delete** — `write()` accepts `BridgeFrame` tuple directly             |
| [`bridge-event-log.ts:187`](../../packages/server/src/bridge/bridge-event-log.ts) | `schemaVersion: 1` injected on every line                    | **Delete** — never emit                                                 |
| `bridge-event-log.test.ts`                                                        | Any golden lines expecting `schemaVersion`                   | **Update** — tuple lines only                                           |
| `docs/TODO/server-log.md`                                                         | Documents v1 envelope with `schemaVersion`                   | **Update** when epic lands                                              |
| External v1 log files on disk                                                     | Historical lines contain `schemaVersion`                     | **Read-only** — no migration; new sessions write tuple lines without it |

After this epic, a log line **is** a `BridgeFrame` 4-tuple — no wrapper object, no `schemaVersion`, no `kind: 'frame'`. Timestamp moves to index `0` of the frame tuple (`ts` slot), not a separate envelope field.

**Out of scope:** `schemaVersion` on **workflow checkpoints** ([`workflow-checkpoint.ts`](../../packages/shared/src/types/workflow-checkpoint.ts), [`workflow-checkpoint-store.ts`](../../packages/server/src/checkpoint/workflow-checkpoint-store.ts)) — persisted resume artifacts; unrelated to bridge NDJSON.

### B. API, Data Contracts & DAL Strategy

- **Authoritative Source of Truth:** tuple definitions in `@langflower/runtime` (`types.ts`); `BridgeFrame` envelope in `@langflower/websocket-bridge` (`bridge-types.ts`). Shared bus references runtime types directly — no mirror payload module.

#### `BridgeFrame` — tuple (WS wire = log line)

Positional schema — **array, not object**:

```typescript
// [ts, transportDir, busType, payload]
type BridgeFrame = readonly [
	ts: string, // ISO-8601
	transportDir: 'in' | 'out', // socket direction (client→server vs server→client)
	busType: string, // e.g. 'runner.port' | 'runner.done' | 'editor.addEdges'
	payload: unknown,
];
```

**WS / log:** `JSON.stringify(frame)` — identical 4-tuple JSON on both sinks; append the same string to NDJSON as sent on the socket.

#### `PortTelemetry` — tuple (replaces `RuntimeOutputEmittedEvent` + `RuntimeInputReceivedEvent`)

**Replace** the object types at [`types.ts:131–154`](../../packages/runtime/src/types.ts) with one tuple source type:

```typescript
/** Port signal: fixed 8-slot tuple — no kind, no runId on port frames */
export type PortTelemetry = readonly [
	portDir: 'in' | 'out', // 'out' = was output-emitted, 'in' = was input-received
	nodeId: NodeId,
	portId: string, // string ports only; symbol ports never serialized
	state: RuntimePortSignalState,
	value: unknown,
	portIdx: number, // default 0
	edgeIds: readonly EdgeId[], // default []
	feed: RuntimeFeedPortMeta | null,
];
```

**Tuple JSON rule:** never put `undefined` in a tuple slot — `JSON.stringify` turns it into `null` on the wire anyway. Emit **`null`** for absent optional slots (`feed`, and `value` when pending).

| Old object field         | Tuple              | Rule                                                                             |
| ------------------------ | ------------------ | -------------------------------------------------------------------------------- |
| `kind: 'output-emitted'` | `'out'` at index 0 | short discriminator                                                              |
| `kind: 'input-received'` | `'in'` at index 0  | short discriminator                                                              |
| `runId`                  | **omit**           | session `runId` from snapshots / run gate                                        |
| `nodeId`                 | index 1            |                                                                                  |
| `portId`                 | index 2            | string only                                                                      |
| `state`                  | index 3            |                                                                                  |
| `value`                  | index 4            | `null` when pending with no payload (prefer omitting pending input frames in UI) |
| `portIdx`                | index 5            | always present; default `0`                                                      |
| `edgeIds`                | index 6            | always present; default `[]`                                                     |
| `feed`                   | index 7            | always present; default `null`                                                   |

**Examples (JSON on wire and in log):**

```json
[
	"2026-08-06T09:31:05.623Z",
	"out",
	"runner.port",
	["out", "node-1", "draft", "value", "Hello", 0, [], null]
]
```

With feed meta and one edge:

```json
[
	"2026-08-06T09:31:05.623Z",
	"out",
	"runner.port",
	["out", "node-1", "item", "value", 42, 2, ["edge-a"], { "role": "result" }]
]
```

#### `RuntimeRunnerEvent` — compact union

```typescript
export type RuntimeRunnerEvent = PortTelemetry | RuntimeDoneTelemetry;

/** Run ended — tuple, runId omitted when session already knows active run */
export type RuntimeDoneTelemetry = readonly ['done'] | readonly ['done', RunId];
```

#### Bus type consolidation

Collapse `runner.output-emitted` + `runner.input-received` → single **`runner.port`** bus type; port direction is **`payload[0]`** (`'in'` | `'out'`), not a separate WS `type` or `kind` field.

| Before                                   | After                                        |
| ---------------------------------------- | -------------------------------------------- |
| `runner.output-emitted` + object payload | `runner.port` + `PortTelemetry` with `'out'` |
| `runner.input-received` + object payload | `runner.port` + `PortTelemetry` with `'in'`  |
| `runner.done` + `{ kind, runId }`        | `runner.done` + `RuntimeDoneTelemetry` tuple |

#### Migration pattern (no glue module)

Folds and server code use the tuple type directly — destructure named slots or index with TypeScript tuple labels. **Do not** add a `port-telemetry.ts` accessor/builder layer.

```typescript
// fold-port-events.ts — example
const [portDir, nodeId, portId, state, value, ...tail] = event;
if (portDir === 'out') {
	/* was output-emitted */
}
```

Tail slots (`portIdx`, `edgeIds`, `feed`) are read inline at the few call sites that need them; optional tail assembly lives in `runtime-runner.ts` at emit time only.

**Run correlation:** Feed visit keys stay `${runId}:${nodeId}:…` — `runId` comes from `ExecutionFeedSnapshotPayload.runId` / runner fold, not from each port tuple.

- **Wrapper Strategy:**
    - **Emit:** `runtime-runner.ts` builds `PortTelemetry` inline → wraps in `BridgeFrame` 4-tuple → WS + log.
    - **Consume:** codec validates tuple shape at transport boundary; folds destructure payload directly.
    - **Delete:** object spread builders, `event.kind === 'output-emitted'` switches, any `*Adapter` / accessor shim that only renames tuple indices, and the **entire** legacy object envelope codec — no dual-path fallback.
- **Reverse Compatibility Risk Matrix:** Hard cutover in-repo; historical v1 NDJSON on disk is read-only (no migration). All live emit/consume paths switch to tuples in one change.

| Consumer             | Migration                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Feed folds           | destructure `PortTelemetry`; `runId` from composer state                                      |
| Canvas chrome        | same                                                                                          |
| WS integration tests | tuple fixtures                                                                                |
| MCP                  | regenerate meta; tuple tail                                                                   |
| External log parsers | Historical v1 object lines on disk only; new sessions write tuple lines (no in-app v1 reader) |
| Checkpoints          | snapshot `runId`; replay `PortTelemetry[]`                                                    |

### C. Security, Identity & Compliance

- Unchanged from current session/auth model. WS and log receive the same frame bytes — no separate redaction or sanitization path for NDJSON.

### D. Dataflow Architecture & Evolution

1. Runner port signal → inline `PortTelemetry` in `runtime-runner.ts` → `BridgeFrame` 4-tuple.
2. Same JSON array → WebSocket broadcast + NDJSON append.
3. Client parse → transport guards in `bridge-codec.ts` / `bridge-guards.ts` → `runner.port` subject → folds destructure payload.

### E. Validations & Boundary Conditions

- Codec rejects non-array frames or wrong arity at fixed indices.
- `PortTelemetry` tail parser: after index 4, only valid tail combinations accepted.
- Symbol `portId` at runtime → never forwarded on bridge (unchanged policy).

### F. Concurrency & State Collisions

- Reconnect: `executionFeed.snapshot` delivers `{ runId, events: PortTelemetry[] }`; live `runner.port` tuples append without per-frame `runId`.

### G. Error Handling & Resiliency

- Malformed tuple → drop frame + debug log (guards in codec). No fallback to legacy object parsing.

## 4. Verification & Definition of Done (DoD)

### A. Testing Strategy Matrix

- [x] **Unit Testing:** runtime emit tests (tuple shape + tail at emit site); `bridge-codec` / `bridge-guards` round-trip and reject malformed frames.
- [x] **Integration Testing:** WS tests for `runner.port` tuple frames; feed/canvas behavior unchanged.
- [ ] **E2E / Smoke Testing:** Byte-size before/after on streaming mock run.
- [x] **Manual Verification:** DevTools WS frame === log line (tuple JSON).

### B. Manual Verification Script

#### Test Case 1: Tuple on wire equals log line

- Capture `runner.port` message and matching NDJSON line.
- **Expected:** Identical 4-tuple JSON; payload is 5+ tuple starting with `"out"` or `"in"`.

#### Test Case 2: Feed + canvas after migration

- Run streaming workflow; verify feed ordering, HITL, canvas pulse.
- **Expected:** Same UX; no object field access left in folds.

#### Test Case 3: Reconnect

- Refresh mid-run; feed segments by snapshot `runId` + compact port tuples.

### C. Functional Requirements Checklist

- [x] `RuntimeOutputEmittedEvent` / `RuntimeInputReceivedEvent` **object types removed**; replaced by `PortTelemetry` tuple in `types.ts`.
- [x] No `kind` or `runId` on port tuples; direction is `'in'` / `'out'` at index 0.
- [x] `BridgeFrame` is a 4-tuple; WS and logs serialize the **same JSON string** — no log-only sanitization or transform.
- [x] Bus consolidates to `runner.port` (direction in payload[0]).
- [x] Folds migrated — destructure `PortTelemetry` directly; no accessor/glue module.
- [x] `runtime-runner.ts` emits tuples; all runtime tests/fixtures updated.
- [x] Legacy object envelope codec and `runner.output-emitted` / `runner.input-received` bus types **deleted** in the same change — no rollback flag or dual codec.
- [x] **`schemaVersion` removed** from bridge event log; log lines are `BridgeFrame` tuples identical to WS frames.
- [x] ADR + docs updated.
- [x] **`npm run test`** at close-out.

### Verify

- Intermediate (optional): `verify --quick`; focused runtime + feed tests.
- **Close-out (required):** `npm run test` or full `verify` — unit **and** integration.

---

## Appendix — before / after

**Before (object envelope + `schemaVersion` noise + nested payload object):**

```json
{
	"schemaVersion": 1,
	"timestamp": "2026-08-06T09:31:05.623Z",
	"kind": "frame",
	"direction": "outbound",
	"scope": "broadcast",
	"type": "runner.output-emitted",
	"payload": {
		"kind": "output-emitted",
		"runId": "63f4c017-1b32-44ee-aa2d-eff19e6e33c2",
		"nodeId": "node-1",
		"portId": "draft",
		"portIdx": 0,
		"edgeIds": [],
		"state": "value",
		"value": "Hello"
	}
}
```

**After (tuple on wire and in log — same bytes):**

```json
[
	"2026-08-06T09:31:05.623Z",
	"out",
	"runner.port",
	["out", "node-1", "draft", "value", "Hello", 0, [], null]
]
```

**Source type (runtime — compact, not expanded elsewhere):**

```typescript
// packages/runtime/src/types.ts — replaces lines 131–154 object definitions
export type PortTelemetry = readonly [
	'in' | 'out',
	NodeId,
	string,
	RuntimePortSignalState,
	unknown,
	number,
	readonly EdgeId[],
	RuntimeFeedPortMeta | null,
];

export type RuntimeRunnerEvent = PortTelemetry | RuntimeDoneTelemetry;
```

**Old → new mapping for port events:**

| Old                                            | New                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `{ kind: 'output-emitted', runId, nodeId, … }` | `['out', nodeId, portId, state, value, portIdx, edgeIds, feed]` |
| `{ kind: 'input-received', runId, nodeId, … }` | `['in', nodeId, portId, state, value, portIdx, edgeIds, feed]`  |
| `event.kind === 'output-emitted'`              | `event[0] === 'out'` or destructure `[portDir, …]`              |
| `event.runId` on port frame                    | session / snapshot `runId` only                                 |
