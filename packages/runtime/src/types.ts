import type {
	StatefulConnection,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import type { Observable } from 'rxjs';
import type { GraphCluster } from './runtime-helpers.js';

export type RuntimeWireType = string & { __brand: 'RuntimeWireType' };

export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };
export type RunId = string & { readonly __brand: 'RunId' };

type RuntimeInputPortMode = 'single' | 'merge' | 'combine' | 'zip' | 'bypass';

export type RuntimeFeedRole =
	'none' | 'reasoning' | 'draft' | 'tool' | 'shell' | 'result' | 'recovery';

export type RuntimeFeedPortMeta = {
	readonly role?: RuntimeFeedRole;
	/** When true, feed visit stays open for chunks / interleaved streams. */
	readonly streaming?: boolean;
};

/**
 * Typed metadata attached to every `statefulConnection` / `statefulObservable`
 * via the `meta` field. Replaces the old string-encoding scheme.
 */
export type PortMeta = {
	readonly dir: 'in' | 'out';
	/** Port id (e.g. `"value"`, `"lines"`). */
	readonly portId: string | symbol;
	/** Wire type (e.g. `"string"`, `"dynamic"`, `"any"`). */
	readonly wireType: string | symbol;
	/** Input port cardinality — `undefined` for outputs. */
	readonly mode?: RuntimeInputPortMode;
	/** Passthrough source input port id — `undefined` for non-passthrough outputs. */
	readonly fromInput?: string;
	/**
	 * Design-time default for an **unconnected** input. Applied by the runner at
	 * `start` / `startNode` when no edge targets the port (see
	 * `applyPortDefaults`). Server may also persist the same value in
	 * `node.inputs` for the canvas.
	 */
	readonly defaultValue?: unknown;
	/** Author-supplied feed role / streaming hint for the work log. */
	readonly feed?: RuntimeFeedPortMeta;
};

/**
 * Extract the `meta` type carried by a {@link StatefulObservable} /
 * {@link StatefulConnection} — the serializable descriptor attached via the
 * `meta` option, as opposed to the live stream itself.
 */
export type MetaFromStatefulObservable<
	T extends StatefulObservable<unknown, unknown, unknown>,
> = T extends StatefulObservable<unknown, unknown, infer Meta> ? Meta : never;

/**
 * v2 runtime contracts — **execution only**.
 *
 * Responsibilities of `@langflower/runtime` (this module):
 * - Wire node ports and run reactive handlers (StatefulObservable graph).
 * - Minimal edge validation on {@link RuntimeEditor.addEdge} (port existence,
 *   wire-type compatibility). The same rules are duplicated in UI
 *   and `@langflower/server` on purpose — each layer must fail fast without
 *   depending on the others.
 *
 * **Out of scope** (handled by `@langflower/server` or later phases):
 * - `WorkflowGraph` → {@link RuntimeNode} factory (isolated runtime first)
 * - `defineNode` / sync lift adapters
 * - HITL / chat semantics — server marks which ports are HITL and maps
 *   {@link RuntimeRunnerEvent} (+ user replies as seed) to chat / WS protocol
 * - runId persistence, harness, LLM, filesystem
 *
 * **Server telemetry:** subscribe to {@link RuntimeRunner.events$} and
 * translate frames to WebSocket; runtime does not speak WS.
 *
 * Phase 1 builds an **isolated runtime** — nodes wired manually in tests,
 * no Langflower workflow loader yet.
 *
 * ## Status lifecycle
 * - {@link RuntimeRunner.start} / {@link RuntimeRunner.startNode} → `'running'`
 * - Run stays `'running'` until {@link RuntimeRunner.interrupt} or a
 *   {@link RuntimeNode.stopsRun} node emits on a watched output port
 * - `events$` `kind: 'done'` → `'idle'` (empty graph instant completion,
 *   or finish node — see {@link ./ADR.md})
 * - {@link RuntimeRunner.interrupt} → `'stopped'` (edits allowed; next start → `'running'`)
 *
 * ## Errors
 * Node handlers surface failures via RxJS / `StatefulObservable` (`catchError`,
 * port `error$`). Runner telemetry emits `output-emitted` with `state: 'error'`
 * on the source; wiring then drops `ResponseError` so edges do not cascade
 * error chrome to downstream nodes.
 *
 * ## Run scope
 * - {@link RuntimeRunner.start} — wire every cluster that does **not** contain a
 *   {@link RuntimeNode.chatEntry} node; run until interrupt or a
 *   {@link RuntimeNode.stopsRun} finish node.
 * - {@link RuntimeRunner.startNode} — wire only the weakly connected cluster
 *   containing `nodeId`; orphan nodes on the canvas are ignored.
 * - Chat-entry clusters start via {@link RuntimeRunnerApi.pushIntoInput}.
 * - **Empty graph:** instant `done` → `idle` so the editor unlocks.
 *
 * ## Multi-input ports
 * Fan-in cardinality is encoded on {@link PortMeta.mode} (`merge`, `combine`,
 * `zip`, bypass slots, …), not in connection name strings.
 *
 * Merge/combine/zip inputs receive ordered upstreams: runtime sorts edges by
 * `toPort[1]` (slot index), combines their outputs, and connects the result
 * to `inputs[portId]`.
 *
 * **`mode: 'merge'` limitation (blocked on `@rx-evo`):** fan-in forwards
 * success `value$` only. Loading / error / inactive from sources are dropped
 * until the library exports a merge-of-`raw$` (or `fillStatefulObservable`).
 * See BUG-2026-07-15c. Do not rely on merge for full `ResponseWithStatus`
 * forwarding.
 *
 * ## Input vs output ports
 * `inputs` expose {@link StatefulConnection} — runtime wires edges with
 * `connect(source)` on {@link RuntimeRunner.start} and `disconnect()` on
 * {@link RuntimeRunner.interrupt}. Seeds use `connect(of(value))` on open slots.
 * `outputs` expose {@link StatefulObservable} (read side) for telemetry and
 * optional {@link RuntimeNode.stopsRun} completion.
 */

export type RuntimeRunnerStatus = 'idle' | 'running' | 'stopped';

export type RuntimePortSignalState = 'pending' | 'value' | 'error';

/**
 * Port signal tuple — `portDir` `'out'` = output emitted, `'in'` = input received.
 * No per-frame `runId`; session snapshots own run correlation.
 */
export type PortTelemetry = readonly [
	portDir: 'in' | 'out',
	nodeId: NodeId,
	portId: string,
	state: RuntimePortSignalState,
	value: unknown,
	portIdx: number,
	edgeIds: readonly EdgeId[],
	/** Absent feed meta — use `null` (never `undefined`; JSON arrays drop undefined). */
	feed: RuntimeFeedPortMeta | null,
];

/** Run ended — `runId` at index 1 when replay needs explicit correlation. */
export type RuntimeDoneTelemetry = readonly ['done'] | readonly ['done', RunId];

export type RuntimeRunnerEvent = PortTelemetry | RuntimeDoneTelemetry;

export const isPortTelemetry = (
	event: RuntimeRunnerEvent,
): event is PortTelemetry =>
	Array.isArray(event) && (event[0] === 'in' || event[0] === 'out');

export const isRuntimeDone = (
	event: RuntimeRunnerEvent,
): event is RuntimeDoneTelemetry => Array.isArray(event) && event[0] === 'done';

/** Seed value pushed into an input port slot on {@link RuntimeRunner.start}. */
export type RuntimeSeedPortValue = {
	readonly portId: string | symbol;
	/** Multi-input slot index (`0` for single-slot ports). */
	readonly slotIndex: number;
	readonly value: unknown;
};

/**
 * Durable-resume overlay for {@link RuntimeRunnerApi.resume}.
 *
 * Completed nodes are not re-activated: edges into them are skipped, and their
 * last output values are re-emitted from snapshots as edge sources.
 */
export type RuntimeResumeOptions = {
	readonly runId?: RunId;
	readonly completedNodeIds: readonly NodeId[];
	/**
	 * Last successful output values keyed by `nodeId` → `portId` (string ports
	 * only). Required for every outgoing edge from a completed node.
	 */
	readonly outputSnapshots: Readonly<
		Record<string, Readonly<Record<string, unknown>>>
	>;
	readonly initialPayload?: Readonly<
		Record<string, ReadonlyArray<RuntimeSeedPortValue>>
	>;
};

export type RuntimeNode = {
	readonly nodeId: NodeId;

	/**
	 * Input ports — {@link StatefulConnection} relays.
	 *
	 * On run start the runner calls `connect(upstreamOutput)` per edge; on
	 * interrupt it calls `disconnect()`. Open slots may be seeded with
	 * `connect(of(value))`.
	 *
	 * Port metadata lives on `connection.meta` as {@link PortMeta}.
	 */
	readonly inputs: Record<
		string | symbol,
		StatefulConnection<unknown, unknown, PortMeta>
	>;

	/**
	 * Output ports of the node.
	 *
	 * Port metadata lives on `output.meta` as {@link PortMeta}.
	 */
	readonly outputs: Record<
		string | symbol,
		StatefulObservable<unknown, unknown, PortMeta>
	>;

	/**
	 * Router bypass base port ids → wire types (factory metadata).
	 *
	 * Runtime materializes each key as a multi-input base port. Channel outputs
	 * such as `ch` and `ch@1` are slot-specific views over that base input.
	 * Identity conversions (edge tuple ↔ output/checkpoint id ↔ SlotKey) live
	 * in `bypass-ports.ts` — do not invent ad-hoc `@` encodings elsewhere.
	 */
	readonly bypassPorts: Record<string, RuntimeWireType>;

	/**
	 * Materialized bypass slot connections — created dynamically by
	 * {@link RuntimeEditor.addNode} from {@link bypassPorts} metadata.
	 *
	 * Each key maps to an array of independent {@link StatefulConnection}s,
	 * one per slot. Array index equals slot index (edge/SlotKey form).
	 * Outputs-map / checkpoint keys use `bypassOutputPortId` (`ch` / `ch@n`).
	 * Each connection serves as both input (`.connect()`) and output (`.value$`).
	 */
	readonly bypassConnections?: Record<
		string,
		readonly StatefulConnection<unknown, unknown, PortMeta>[]
	>;

	/**
	 * When `true`, the first **value** emission on any watched output port
	 * ends the run (`done` → `idle`). Used by finish / sink nodes.
	 */
	readonly stopsRun?: boolean;

	/**
	 * Chat-entry source — clusters containing this node are omitted from
	 * {@link RuntimeRunnerApi.start}. Start those clusters via
	 * {@link RuntimeRunnerApi.pushIntoInput} (composer) instead.
	 */
	readonly chatEntry?: boolean;

	/**
	 * Declares handler contract: at most one output value per input
	 * activation (e.g. constant, delay). Runtime does not enforce this —
	 * metadata for factories and tests.
	 */
	readonly emitOncePerActivation?: boolean;

	/**
	 * Seeded snapshot node — emits cached outputs without re-execution.
	 * Server skips running/completed telemetry for these nodes.
	 */
	readonly skipExecutionTelemetry?: boolean;
};

export type RuntimeEdge = {
	readonly edgeId: EdgeId;

	readonly fromNodeId: NodeId;
	readonly fromPort: [string, number]; // [portId, slotIndex]
	readonly toNodeId: NodeId;
	readonly toPort: [string, number]; // [portId, slotIndex]
};

/** {@link RuntimeRunner} / {@link RuntimeFacade} construction options. */
export type RuntimeOptions = {
	/**
	 * When `true`, retain every {@link RuntimeRunnerEvent} in
	 * {@link RuntimeRunner.eventLog} for server-side feed replay.
	 */
	readonly log?: boolean;
};

export type RuntimeEditorApi = {
	/**
	 * Register a node and its port observables (handler already bound).
	 *
	 * NodeId exist  => node being added from serizlized workflow
	 * NodeId does not exist => new node from UI
	 *
	 * Must fail while {@link RuntimeRunnerApi.status$} is `'running'`.
	 *
	 * return false while running or node cant be added
	 */
	addNode(
		node: Omit<RuntimeNode, 'nodeId'> &
			Partial<Pick<RuntimeNode, 'nodeId'>>,
	): RuntimeNode | false;

	/**
	 * Connect two ports. Returns false if the edge already exists or validation
	 * fails (unknown node/port, slot out of range, wire-type mismatch).
	 * Router bypass lanes use the same rules — their portIds live in
	 * `inputs` / `outputs`; passthrough semantics belong in the node definition.
	 *
	 * Must fail while {@link RuntimeRunnerApi.status$} is `'running'`.
	 *
	 * return false while running or node cant be added
	 */
	addEdge(
		edge: Omit<RuntimeEdge, 'edgeId'>,
		options?: { readonly edgeId?: EdgeId },
	): RuntimeEdge | false;

	/**
	 * Replace the edge on {@link RuntimeEdge.toPort} with `edge`.
	 *
	 * Returns the replaced edge on success; `false` when the target port is
	 * free, the request duplicates an existing edge, validation fails, or the
	 * graph is locked. Does not cascade-remove other edges.
	 */
	replaceEdge(edge: Omit<RuntimeEdge, 'edgeId'>): RuntimeEdge | false;

	/** Must fail while runner status is `'running'`.
	 *
	 * return false while running or node not found
	 */
	removeNode(nodeId: NodeId): RuntimeNode | false;

	/** Must fail while runner status is `'running'`.
	 * return removed nodes or empty array
	 */
	removeEdge(edgeId: EdgeId): RuntimeNode[];

	getNode(nodeId: NodeId): RuntimeNode | false;
	getEdge(edgeId: EdgeId): RuntimeEdge | false;
	getNodes(): RuntimeNode[];
	getEdges(): RuntimeEdge[];

	/** For serialization; graph must be idle or stopped. */
	getAll(): { nodes: RuntimeNode[]; edges: RuntimeEdge[] };

	/** Ready-to-use calculated graph clusters. Recalculated after graph edits. */
	allClusters: readonly GraphCluster[];

	/** Resolve the ready cluster containing `nodeId`. */
	getClusterByNodeId(nodeId: NodeId): GraphCluster;
};

export type RuntimeRunnerApi = {
	/**
	 * Wire every cluster that does not contain a {@link RuntimeNode.chatEntry}
	 * node, seed source inputs, set status to `'running'`.
	 *
	 * Chat-entry clusters are omitted — start them via
	 * {@link RuntimeRunnerApi.pushIntoInput}. When every cluster is chat-entry
	 * (or the graph is empty), returns `false` / instant `done` respectively.
	 *
	 * Run stays `'running'` until {@link RuntimeRunnerApi.interrupt} or a
	 * {@link RuntimeNode.stopsRun} node emits. Empty graph emits instant `done`.
	 *
	 * Throws if status is already `'running'`.
	 *
	 * @returns runId — correlates {@link RuntimeRunnerEvent} for the server
	 * adapter; runtime does not persist runs.
	 */
	start(
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		runId?: RunId,
	): RunId | false;

	/**
	 * Run-from-node: wire the weakly connected cluster containing `nodeId`
	 * (orphan nodes elsewhere on the canvas are not wired).
	 *
	 * Run stays `'running'` until {@link RuntimeRunnerApi.interrupt} or a
	 * {@link RuntimeNode.stopsRun} node in scope emits.
	 *
	 * Throws if status is already `'running'`.
	 *
	 * Flow: `RuntimeEditorApi.getClusterByNodeId(nodeId)` -> internal runner
	 * `runScope` (cluster node/edge sets).
	 *
	 * @returns runId — same semantics as {@link RuntimeRunnerApi.start}.
	 */
	startNode(
		nodeId: NodeId,
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		runId?: RunId,
	): RunId | false;

	/**
	 * Resume a stopped run: wire the full graph, skip completed nodes, and
	 * replay their output snapshots into downstream edges.
	 *
	 * Returns `false` when already `'running'`. Throws when a completed node's
	 * outgoing edge lacks a string-port snapshot.
	 */
	resume(options: RuntimeResumeOptions): RunId | false;

	/**
	 * Push a value into an input port for HITL-style entry.
	 *
	 * If the runner is idle or stopped, this starts the weakly connected
	 * cluster containing `nodeId`, like {@link RuntimeRunnerApi.startNode}, then
	 * delivers `payload` to the requested single input port. If a run is already
	 * active, the value is delivered only when `nodeId` is inside that run scope.
	 *
	 * Returns the active `runId` when the payload was accepted, or `false` when
	 * the target node/port is missing, out of scope, multi-input, or already
	 * occupied by an edge/seed.
	 */
	pushIntoInput(cfg: {
		nodeId: NodeId;
		portId: string;
		payload: unknown;
	}): RunId | false;

	/**
	 * Unsubscribe wired edges, set status to `'stopped'`.
	 * Does not dispose the editor graph.
	 */
	interrupt(reason: 'cancel'): void;

	/**
	 * End the active run with `done` when execution cannot reach a
	 * {@link RuntimeNode.stopsRun} node (e.g. upstream failures).
	 */
	completeRun(): void;

	/**
	 * Drop every recorded frame from {@link RuntimeRunner.eventLog} so the
	 * server can rebuild an empty `executionFeed.snapshot`. No-op when the
	 * runner was not constructed with `{ log: true }` (the shared empty log
	 * is never mutated).
	 */
	clearEventLog(): void;

	dispose(): void;

	/**
	 * `'idle'` — no active run, or natural completion (`done`); edits allowed.
	 * `'running'` — active run; {@link RuntimeEditorApi} mutations must be rejected.
	 * `'stopped'` — cancelled via {@link RuntimeRunnerApi.interrupt}; edits allowed.
	 */
	readonly status$: Observable<RuntimeRunnerStatus>;
	/** Synchronous snapshot of {@link status$} (latest emission). */
	readonly status: RuntimeRunnerStatus;

	/**
	 * Live port telemetry for the active run (`runId` on each frame).
	 * **Hot only** — subscribers receive events emitted after subscribe;
	 * no replay of past frames.
	 *
	 * `@langflower/server` subscribes at run start and maps to WebSocket
	 * execution events.
	 */
	readonly events$: Observable<RuntimeRunnerEvent>;

	/**
	 * In-memory run event log when {@link RuntimeRunner} is constructed with
	 * `{ log: true }`. Used by `@langflower/server` for feed replay.
	 */
	readonly eventLog: readonly RuntimeRunnerEvent[];
};
