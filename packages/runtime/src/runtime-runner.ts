import {
	combineStatefulObservables,
	isError,
	isInactive,
	isLoading,
	isSuccess,
	ResponseWithStatus,
	statefulObservable,
	StatefulConnection,
	StatefulObservable,
} from '@rx-evo/stateful-observable';
import {
	BehaviorSubject,
	filter,
	merge,
	Observable,
	of,
	Subject,
	Subscription,
	tap,
	zip,
} from 'rxjs';
import {
	checkpointPortIdForSlot,
	getBypassConnection,
	isBypassPort,
} from './bypass-ports.js';
import { normalizePortErrorValue } from './normalize-port-error-value.js';
import {
	edgePortSlotKey,
	parseSlotKey,
	SlotKey,
	slotKey,
} from './port-meta.js';
import { RuntimeEditor } from './runtime-editor.js';
import {
	clusterHasChatEntry,
	collectClusterSlotKeys,
	GraphCluster,
} from './runtime-helpers.js';
import {
	PortMeta,
	RuntimeEdge,
	RuntimeNode,
	RuntimeOptions,
	RuntimePortSignalState,
	RuntimeFeedPortMeta,
	RuntimeResumeOptions,
	RuntimeRunnerApi,
	RuntimeRunnerEvent,
	RuntimeRunnerStatus,
	RuntimeSeedPortValue,
	type EdgeId,
	type NodeId,
	type PortTelemetry,
	type RunId,
} from './types.js';

type ResumeOverlay = {
	readonly completedNodeIds: ReadonlySet<NodeId>;
	readonly outputSnapshots: ReadonlyMap<NodeId, ReadonlyMap<string, unknown>>;
};

type WiredInputSlot = {
	readonly edgeId: EdgeId;
	readonly connection: StatefulConnection<unknown, unknown, PortMeta>;
};

type PushedInputSource = {
	readonly source: Subject<unknown>;
};

type MultyInputGroup = {
	readonly nodeId: NodeId;
	readonly portId: string;
	readonly mode: 'merge' | 'combine' | 'zip';
	readonly connection: StatefulConnection<unknown, unknown, PortMeta>;
	readonly edges: {
		readonly edge: RuntimeEdge;
		readonly source: StatefulObservable<unknown, unknown, PortMeta>;
	}[];
};

type ActiveRun = {
	readonly runId: RunId;
	readonly scopeNodeIds: ReadonlySet<NodeId>;
	readonly wiredSlotKeys: Set<SlotKey>;
	readonly wiredSlots: WiredInputSlot[];
	readonly pushedInputSources: Map<SlotKey, PushedInputSource>;
	readonly subscriptions: Subscription;
};

/**
 * Maps one `@rx-evo` `ResponseWithStatus` emission to the runtime telemetry
 * signal. `@rx-evo` `StatefulConnection`s surface the full union on `raw$`
 * (`isLoading` → pending, `isError` → error with `.error`, success → value);
 * plain-Observable sources (e.g. `of(v).pipe(delay(ms))`) emit a loading
 * sentinel at connect time, so pending/error are now observable. `isInactive`
 * (disconnect / reset) is intentionally not emitted as telemetry.
 */
type ResolvedSignal = {
	readonly state: RuntimePortSignalState;
	readonly value: unknown;
};

const isConnectionInactive = (
	connection: StatefulConnection<unknown, unknown, PortMeta>,
): boolean => {
	let inactive = true;
	const sub = connection.raw$.subscribe((raw) => {
		// Same dual-package Symbol hazard as loading (BUG-2026-07-23 /
		// ADR-028): CJS `isInactive` can miss an ESM inactive sentinel.
		inactive = isInactive(raw) || isSymbolStateSentinel(raw);
	});
	sub.unsubscribe();
	return inactive;
};

/**
 * `@rx-evo` status sentinels are `{ state: Symbol(...) }` (loading / inactive).
 * When the sentinel is created by a different module instance than the
 * `isLoading` / `isInactive` guards (CJS/ESM dual-package hazard), identity
 * checks fail and `isSuccess` may return true — telemetry then emits
 * `state:'value'` with that object (JSON → `{}`), or `applyPortDefaults`
 * skips seeding and LLM `combineInputs` stalls.
 */
const isSymbolStateSentinel = (signal: unknown): boolean => {
	if (
		typeof signal !== 'object' ||
		signal === null ||
		Array.isArray(signal)
	) {
		return false;
	}

	const keys = Object.keys(signal);

	if (keys.length !== 1 || keys[0] !== 'state') {
		return false;
	}

	const state = (signal as { readonly state: unknown }).state;

	return typeof state === 'symbol';
};

const resolveSignalState = (response: unknown): ResolvedSignal | null => {
	const signal = response as ResponseWithStatus<object, unknown>;

	if (isError(signal)) {
		return {
			state: 'error',
			value: normalizePortErrorValue(
				(signal as { error: unknown }).error,
			),
		};
	}

	if (isLoading(signal) || isSymbolStateSentinel(signal)) {
		return { state: 'pending', value: undefined };
	}

	if (isSuccess(signal)) {
		return { state: 'value', value: signal };
	}

	return null;
};

/** Drop errors and loading so edges only carry success values. */
const isEdgeForwardable = (response: unknown): boolean =>
	!isError(response) &&
	!isLoading(response) &&
	!isSymbolStateSentinel(response);

export class RuntimeRunner implements RuntimeRunnerApi {
	private static readonly EMPTY_EVENT_LOG: readonly RuntimeRunnerEvent[] = [];

	private readonly statusSubject = new BehaviorSubject<RuntimeRunnerStatus>(
		'idle',
	);
	private readonly eventsSubject = new Subject<RuntimeRunnerEvent>();
	private readonly logEvents: boolean;
	private readonly eventLogBuffer: RuntimeRunnerEvent[] = [];

	private activeRun: ActiveRun | undefined;
	private disposed = false;

	readonly status$: Observable<RuntimeRunnerStatus> =
		this.statusSubject.asObservable();
	/** Synchronous snapshot of {@link status$}. */
	get status(): RuntimeRunnerStatus {
		return this.statusSubject.value;
	}
	readonly events$: Observable<RuntimeRunnerEvent> =
		this.eventsSubject.asObservable();
	readonly eventLog: readonly RuntimeRunnerEvent[];

	constructor(
		private readonly editor: RuntimeEditor,
		options: RuntimeOptions = {},
	) {
		this.logEvents = options.log === true;
		this.eventLog = this.logEvents
			? this.eventLogBuffer
			: RuntimeRunner.EMPTY_EVENT_LOG;
	}

	start(
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		runId?: RunId,
	): RunId | false {
		this.assertNotDisposed();

		if (this.statusSubject.value === 'running') {
			return false;
		}

		const resolvedRunId = runId ?? (crypto.randomUUID() as RunId);

		const nodes = this.editor.getNodes();

		if (nodes.length === 0) {
			this.setStatus('running');
			this.finishRun(resolvedRunId);
			return resolvedRunId;
		}

		const plainClusters = this.editor.allClusters.filter(
			(cluster) =>
				!clusterHasChatEntry(cluster, (nodeId) =>
					this.editor.getNode(nodeId),
				),
		);

		if (plainClusters.length === 0) {
			return false;
		}

		const scopeNodeIds = new Set<NodeId>();
		const scopeEdgeIds = new Set<EdgeId>();

		for (const cluster of plainClusters) {
			for (const nodeId of cluster.nodeIds) {
				scopeNodeIds.add(nodeId);
			}
			for (const edgeId of cluster.edgeIds) {
				scopeEdgeIds.add(edgeId);
			}
		}

		return this.runScope(
			scopeNodeIds,
			scopeEdgeIds,
			initialPayload,
			resolvedRunId,
		);
	}

	startNode(
		nodeId: NodeId,
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		runId?: RunId,
	): RunId | false {
		// Composer: resolve cluster → start scoped run
		const cluster = this.editor.getClusterByNodeId(nodeId);
		return this.runScope(
			cluster.nodeIds,
			cluster.edgeIds,
			initialPayload,
			runId,
		);
	}

	resume(options: RuntimeResumeOptions): RunId | false {
		this.assertNotDisposed();

		if (this.statusSubject.value === 'running') {
			return false;
		}

		const completedNodeIds = new Set(options.completedNodeIds);
		const outputSnapshots = new Map<NodeId, ReadonlyMap<string, unknown>>();

		for (const [rawNodeId, ports] of Object.entries(
			options.outputSnapshots,
		)) {
			outputSnapshots.set(
				rawNodeId as NodeId,
				new Map(Object.entries(ports)),
			);
		}

		const nodes = this.editor.getNodes();
		const edges = this.editor.getEdges();
		const resolvedRunId = options.runId ?? (crypto.randomUUID() as RunId);

		if (
			nodes.some(
				(node) =>
					node.stopsRun === true && completedNodeIds.has(node.nodeId),
			)
		) {
			this.editor.setLocked(true);
			this.setStatus('running');
			this.activeRun = {
				runId: resolvedRunId,
				scopeNodeIds: new Set(nodes.map((node) => node.nodeId)),
				wiredSlotKeys: new Set(),
				wiredSlots: [],
				pushedInputSources: new Map(),
				subscriptions: new Subscription(),
			};
			this.finishRun(resolvedRunId);
			return resolvedRunId;
		}

		if (nodes.length === 0) {
			this.setStatus('running');
			this.finishRun(resolvedRunId);
			return resolvedRunId;
		}

		return this.runScope(
			new Set(nodes.map((node) => node.nodeId)),
			new Set(edges.map((edge) => edge.edgeId)),
			options.initialPayload,
			resolvedRunId,
			{
				completedNodeIds,
				outputSnapshots,
			},
		);
	}

	pushIntoInput(cfg: {
		nodeId: NodeId;
		portId: string;
		payload: unknown;
	}): RunId | false {
		this.assertNotDisposed();

		// Hot path: run already active
		if (this.statusSubject.value === 'running') {
			return this.pushIntoActiveRun(cfg);
		}

		// Cold-start composer: validate → resolve cluster → start scope → push → rollback on fail
		const node = this.editor.getNode(cfg.nodeId);

		if (
			node === false ||
			!this.canPreparePushedInput(node, cfg.portId) ||
			this.isInputOccupiedByEdge(cfg.nodeId, cfg.portId)
		) {
			return false;
		}

		let cluster: GraphCluster;

		try {
			cluster = this.editor.getClusterByNodeId(cfg.nodeId);
		} catch {
			return false;
		}

		const runId = this.runScope(cluster.nodeIds, cluster.edgeIds);
		const pushedRunId = this.pushIntoActiveRun(cfg);

		if (pushedRunId === false) {
			this.interrupt('cancel');
			return false;
		}

		return runId;
	}

	interrupt(_reason: 'cancel'): void {
		this.assertNotDisposed();

		if (this.statusSubject.value !== 'running') {
			return;
		}

		this.teardownRun();
		this.setStatus('stopped');
	}

	/** Ends the active run with `done` when no `stopsRun` node can fire. */
	completeRun(): void {
		this.assertNotDisposed();

		if (
			this.statusSubject.value !== 'running' ||
			this.activeRun === undefined
		) {
			return;
		}

		this.finishRun(this.activeRun.runId);
	}

	clearEventLog(): void {
		this.assertNotDisposed();

		// `eventLog` aliases `eventLogBuffer` only when `logEvents` is true;
		// otherwise it points at the shared frozen `EMPTY_EVENT_LOG`.
		if (this.logEvents) {
			this.eventLogBuffer.length = 0;
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		if (this.statusSubject.value === 'running') {
			this.teardownRun();
		}

		this.disposed = true;
		this.editor.setLocked(false);

		// Complete only when still open — avoids ObjectUnsubscribedError on
		// double-dispose / teardown races with late port microtasks.
		if (!this.statusSubject.closed) {
			this.statusSubject.complete();
		}

		if (!this.eventsSubject.closed) {
			this.eventsSubject.complete();
		}
	}

	private assertNotDisposed(): void {
		if (this.disposed) {
			throw new Error('Runtime graph is disposed');
		}
	}

	private setStatus(status: RuntimeRunnerStatus): void {
		if (this.disposed || this.statusSubject.closed) {
			return;
		}

		this.statusSubject.next(status);
	}

	private emitRunnerEvent(event: RuntimeRunnerEvent): void {
		if (this.disposed || this.eventsSubject.closed) {
			return;
		}

		if (this.logEvents) {
			this.eventLogBuffer.push(event);
		}

		this.eventsSubject.next(event);
	}

	private emitPortEvent(
		_runId: RunId,
		portDir: 'in' | 'out',
		nodeId: NodeId,
		portId: string | symbol,
		portIdx: number,
		state: RuntimePortSignalState,
		value: unknown,
		edgeIds: EdgeId[],
		feed?: RuntimeFeedPortMeta,
	): void {
		const portIdStr = typeof portId === 'string' ? portId : String(portId);
		this.emitRunnerEvent([
			portDir,
			nodeId,
			portIdStr,
			state,
			value,
			portIdx,
			edgeIds,
			feed ?? null,
		]);
	}

	private canPreparePushedInput(
		node: RuntimeNode,
		portId: string | symbol,
	): boolean {
		const connection = node.inputs[portId];

		if (connection === undefined) {
			return false;
		}

		const meta = connection.meta;

		return meta.portId === portId && meta.mode === 'single';
	}

	private isInputOccupiedByEdge(
		nodeId: NodeId,
		portId: string | symbol,
	): boolean {
		return this.editor
			.getEdges()
			.some(
				(edge) =>
					edge.toNodeId === nodeId &&
					edge.toPort[0] === portId &&
					edge.toPort[1] === 0,
			);
	}

	private pushIntoActiveRun(cfg: {
		nodeId: NodeId;
		portId: string;
		payload: unknown;
	}): RunId | false {
		const run = this.activeRun;

		if (run === undefined || !run.scopeNodeIds.has(cfg.nodeId)) {
			return false;
		}

		const node = this.editor.getNode(cfg.nodeId);

		if (node === false || !this.canPreparePushedInput(node, cfg.portId)) {
			return false;
		}

		const key = slotKey(cfg.nodeId, cfg.portId, 0);
		const existing = run.pushedInputSources.get(key);

		if (existing !== undefined) {
			// Telemetry before deliver so HITL input-received precedes cascade
			// (output-emitted / downstream input-received) in the event log.
			this.emitPortEvent(
				run.runId,
				'in',
				cfg.nodeId,
				cfg.portId,
				0,
				'value',
				cfg.payload,
				[],
			);
			existing.source.next(cfg.payload);
			return run.runId;
		}

		if (run.wiredSlotKeys.has(key)) {
			return false;
		}

		const connection = node.inputs[cfg.portId];

		if (connection === undefined) {
			return false;
		}

		const source = new Subject<unknown>();

		connection.connect(source);
		run.wiredSlotKeys.add(key);
		run.wiredSlots.push({
			edgeId: `push:${key}` as EdgeId,
			connection,
		});
		run.pushedInputSources.set(key, { source });
		this.emitPortEvent(
			run.runId,
			'in',
			cfg.nodeId,
			cfg.portId,
			0,
			'value',
			cfg.payload,
			[],
		);
		source.next(cfg.payload);

		return run.runId;
	}

	/**
	 * Returns `output` wrapped with a `tap` that emits `output-emitted`
	 * telemetry, then `filter(isEdgeForwardable)` so `ResponseError` and
	 * loading sentinels stay visible to Observability on the source node but
	 * are not forwarded on edges (loading must not appear as `{}` downstream).
	 * The wrapper is the value the downstream connects to, so the event fires
	 * *as part of* the dataflow delivery — there is no separate refCounted
	 * subscriber, which is what previously reordered events against downstream
	 * `input-received`s. Must still be subscribed/connected somewhere
	 * (downstream `connect`, or the end-node driver) to run.
	 */
	private tapOutputPort(
		run: ActiveRun,
		nodeId: NodeId,
		portId: string,
		output: StatefulObservable<unknown, unknown, PortMeta>,
		edgeIds: EdgeId[],
	): StatefulObservable<unknown, unknown, PortMeta> {
		if (typeof output.meta.portId !== 'string') return output;

		const node = this.editor.getNode(nodeId);

		return output
			.pipe(
				tap({
					next: (response: unknown) => {
						const resolved = resolveSignalState(response);

						if (resolved === null) {
							return;
						}

						this.emitPortEvent(
							run.runId,
							'out',
							nodeId,
							portId,
							0,
							resolved.state,
							resolved.value,
							edgeIds,
							output.meta.feed,
						);

						if (
							resolved.state === 'value' &&
							node !== false &&
							node.stopsRun === true
						) {
							const finishRunId = run.runId;
							queueMicrotask(() => {
								if (this.activeRun?.runId === finishRunId) {
									this.finishRun(finishRunId);
								}
							});
						}
					},
				}),
				filter(isEdgeForwardable),
			)
			.with({ meta: output.meta });
	}

	/**
	 * Returns `source` wrapped with a `tap` that emits `input-received`
	 * telemetry for the target `(nodeId, portId, slotIndex)`. Like
	 * {@link RuntimeRunner.tapOutputPort} the observer rides the dataflow
	 * path instead of adding a separate subscriber.
	 */
	private tapInputPort(
		run: ActiveRun,
		nodeId: NodeId,
		portId: string,
		slotIndex: number,
		source: StatefulObservable<unknown, unknown, PortMeta>,
		edgeIds: EdgeId[],
	): StatefulObservable<unknown, unknown, PortMeta> {
		if (typeof portId !== 'string') return source;

		return source
			.pipe(
				tap({
					next: (response: unknown) => {
						const resolved = resolveSignalState(response);

						if (resolved === null) {
							return;
						}

						this.emitPortEvent(
							run.runId,
							'in',
							nodeId,
							portId,
							slotIndex,
							resolved.state,
							resolved.value,
							edgeIds,
						);
					},
				}),
			)
			.with({ meta: source.meta });
	}

	private finishRun(runId: RunId): void {
		if (this.disposed) {
			return;
		}

		if (this.activeRun !== undefined && this.activeRun.runId !== runId) {
			return;
		}

		this.emitRunnerEvent(['done', runId]);
		this.setStatus('idle');
		this.teardownRun();
	}

	private runScope(
		scopeNodeIds: ReadonlySet<NodeId>,
		scopeEdgeIds: ReadonlySet<EdgeId>,
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		runId?: RunId,
		resumeOverlay?: ResumeOverlay,
	): RunId | false {
		this.assertNotDisposed();

		if (this.statusSubject.value === 'running') {
			return false;
		}

		const resolvedRunId = runId ?? (crypto.randomUUID() as RunId);
		this.editor.setLocked(true);
		try {
			this.activeRun = this.wireScope(
				resolvedRunId,
				scopeEdgeIds,
				scopeNodeIds,
				initialPayload,
				resumeOverlay,
			);
		} catch (error) {
			this.editor.setLocked(false);
			throw error;
		}
		this.setStatus('running');

		return resolvedRunId;
	}

	private teardownRun(): void {
		if (this.activeRun === undefined) {
			return;
		}

		for (const wired of this.activeRun.wiredSlots) {
			wired.connection.disconnect();
		}

		for (const pushed of this.activeRun.pushedInputSources.values()) {
			pushed.source.complete();
		}

		this.activeRun.subscriptions.unsubscribe();
		this.activeRun = undefined;
		this.editor.setLocked(false);
	}

	private applySeeds(
		runId: RunId,
		seedsByNode: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		wiredSlotKeys: Set<SlotKey>,
	): WiredInputSlot[] {
		const seeded: WiredInputSlot[] = [];

		for (const [rawNodeId, seeds] of Object.entries(seedsByNode)) {
			const nodeId = rawNodeId as NodeId;
			const node = this.editor.getNode(nodeId);

			if (node === false) {
				continue;
			}

			for (const seed of seeds) {
				const key = slotKey(nodeId, seed.portId, seed.slotIndex);

				if (wiredSlotKeys.has(key)) {
					continue;
				}

				const connection = node.inputs[seed.portId];

				if (connection === undefined) {
					throw new Error(
						`Unknown seed slot ${nodeId}.${String(seed.portId)}[${seed.slotIndex}]`,
					);
				}

				const meta = connection.meta;

				if (
					meta.portId !== seed.portId ||
					(meta.mode === 'single' && seed.slotIndex !== 0)
				) {
					throw new Error(
						`Unknown seed slot ${nodeId}.${String(seed.portId)}[${seed.slotIndex}]`,
					);
				}

				connection.connect(
					of(seed.value).pipe(
						tap({
							next: (value) => {
								if (typeof seed.portId !== 'symbol') {
									this.emitPortEvent(
										runId,
										'in',
										nodeId,
										seed.portId,
										seed.slotIndex,
										'value',
										value,
										[],
									);
								}
							},
						}),
					),
				);
				wiredSlotKeys.add(key);
				seeded.push({
					edgeId: `seed:${key}` as EdgeId,
					connection,
				});
			}
		}

		return seeded;
	}

	/**
	 * Seed `meta.defaultValue` onto every in-scope input that has no edge and
	 * is still inactive (nothing connected — not even a materialize-time or
	 * harness seed). Optional ports (e.g. LLM `tools: []`) rely on this so
	 * `combineInputs` does not stall when nothing is wired.
	 */
	private applyPortDefaults(
		runId: RunId,
		scopeNodeIds: ReadonlySet<NodeId>,
		wiredSlotKeys: Set<SlotKey>,
	): WiredInputSlot[] {
		const seeded: WiredInputSlot[] = [];

		for (const nodeId of scopeNodeIds) {
			const node = this.editor.getNode(nodeId);

			if (node === false) {
				continue;
			}

			for (const [portId, connection] of Object.entries(node.inputs)) {
				const key = slotKey(nodeId, portId, 0);

				if (wiredSlotKeys.has(key)) {
					continue;
				}

				const defaultValue = connection.meta.defaultValue;

				if (
					defaultValue === undefined ||
					!isConnectionInactive(connection)
				) {
					continue;
				}

				connection.connect(
					of(defaultValue).pipe(
						tap({
							next: (value) => {
								this.emitPortEvent(
									runId,
									'in',
									nodeId,
									portId,
									0,
									'value',
									value,
									[],
								);
							},
						}),
					),
				);
				wiredSlotKeys.add(key);
				seeded.push({
					edgeId: `default:${key}` as EdgeId,
					connection,
				});
			}
		}

		return seeded;
	}

	private wireScope(
		runId: RunId,
		scopeEdgeIds: ReadonlySet<EdgeId>,
		scopeNodeIds: ReadonlySet<NodeId>,
		initialPayload?: Readonly<
			Record<string, ReadonlyArray<RuntimeSeedPortValue>>
		>,
		resumeOverlay?: ResumeOverlay,
	): ActiveRun {
		const completedNodeIds =
			resumeOverlay?.completedNodeIds ?? new Set<NodeId>();
		const scopeEdges = this.editor
			.getEdges()
			.filter(
				(edge) =>
					scopeEdgeIds.has(edge.edgeId) &&
					!completedNodeIds.has(edge.toNodeId),
			);
		const wiredSlotKeys = new Set<SlotKey>();
		const wiredSlots: WiredInputSlot[] = [];
		const multyInputGroups = new Map<SlotKey, MultyInputGroup>();
		const subscriptions = new Subscription();
		const nodesById = new Map(
			this.editor.getNodes().map((node) => [node.nodeId, node]),
		);
		const scopeOutputKeys = collectClusterSlotKeys(nodesById, scopeNodeIds);
		const outputEdgeIds = new Map<SlotKey, EdgeId[]>();
		const inputEdgeIds = new Map<SlotKey, EdgeId[]>();

		const run: ActiveRun = {
			runId,
			scopeNodeIds,
			wiredSlotKeys,
			wiredSlots,
			pushedInputSources: new Map(),
			subscriptions,
		};

		// Pre-pass: track edge IDs per port for telemetry, then build one
		// telemetry-tapped wrapper per output. Downstream connects to the
		// wrapper, so `output-emitted` rides the dataflow path instead of a
		// separate refCounted subscriber (which previously reordered events).
		for (const edge of scopeEdges) {
			const fromKey = edgePortSlotKey(edge.fromNodeId, edge.fromPort);
			const toKey = edgePortSlotKey(edge.toNodeId, edge.toPort);

			const fromIds = outputEdgeIds.get(fromKey);
			if (fromIds !== undefined) {
				fromIds.push(edge.edgeId);
			} else {
				outputEdgeIds.set(fromKey, [edge.edgeId]);
			}

			const toIds = inputEdgeIds.get(toKey);
			if (toIds !== undefined) {
				toIds.push(edge.edgeId);
			} else {
				inputEdgeIds.set(toKey, [edge.edgeId]);
			}
		}

		const watchedByKey = new Map<
			SlotKey,
			StatefulObservable<unknown, unknown, PortMeta>
		>();
		for (const key of scopeOutputKeys) {
			const { nodeId, portId, slotIndex } = parseSlotKey(key);
			const node = nodesById.get(nodeId);
			const isBypassBase =
				node !== undefined && isBypassPort(node, portId);
			let output:
				StatefulObservable<unknown, unknown, PortMeta> | undefined;
			if (isBypassBase) {
				// Wrap the actual slot connection (not a hardcoded slot 0) so
				// multi-slot bypass ports emit telemetry for the right slot.
				output = getBypassConnection(node, portId, slotIndex);
			} else {
				output = node?.outputs[portId];
			}
			if (output === undefined) {
				continue;
			}

			// Bypass: edge/SlotKey use base+index; checkpoint/tap use ch@n.
			// See bypass-ports identity helpers (BUG-2026-07-20).
			const snapshotPortId =
				node !== undefined
					? checkpointPortIdForSlot(node, portId, slotIndex)
					: portId;
			const snapshotValue =
				typeof snapshotPortId === 'string'
					? resumeOverlay?.outputSnapshots
							.get(nodeId)
							?.get(snapshotPortId)
					: undefined;
			const sourceOutput =
				completedNodeIds.has(nodeId) && snapshotValue !== undefined
					? statefulObservable({
							loader: () => of(snapshotValue),
							meta: output.meta,
						})
					: completedNodeIds.has(nodeId)
						? undefined
						: output;

			if (sourceOutput === undefined) {
				continue;
			}

			watchedByKey.set(
				key,
				this.tapOutputPort(
					run,
					nodeId,
					snapshotPortId,
					sourceOutput,
					outputEdgeIds.get(key) ?? [],
				),
			);
		}

		// Clear materialize-time defaults on ports that edges will drive so a
		// stale default cannot win the first combineInputs tick (BUG-2026-07-12b).
		const clearedConnections = new Set<
			StatefulConnection<unknown, unknown, PortMeta>
		>();
		for (const toKey of inputEdgeIds.keys()) {
			const { nodeId, portId, slotIndex } = parseSlotKey(toKey);
			const toNode = nodesById.get(nodeId);

			if (toNode === undefined || completedNodeIds.has(nodeId)) {
				continue;
			}

			let input:
				StatefulConnection<unknown, unknown, PortMeta> | undefined;
			if (isBypassPort(toNode, portId)) {
				input = getBypassConnection(toNode, portId, slotIndex);
			} else {
				input = toNode.inputs[portId];
			}

			if (input === undefined || clearedConnections.has(input)) {
				continue;
			}

			input.disconnect();
			clearedConnections.add(input);
		}

		for (const edge of scopeEdges) {
			const fromNode = nodesById.get(edge.fromNodeId);
			const toNode = nodesById.get(edge.toNodeId);

			if (fromNode === undefined || toNode === undefined) {
				throw new Error(`Edge ${edge.edgeId} references missing node`);
			}

			const fromKey = edgePortSlotKey(edge.fromNodeId, edge.fromPort);
			const toKey = edgePortSlotKey(edge.toNodeId, edge.toPort);
			const [fromPortId, fromSlotIndex] = edge.fromPort;
			const [toPortId, toSlotIndex] = edge.toPort;

			if (
				completedNodeIds.has(edge.fromNodeId) &&
				!watchedByKey.has(fromKey)
			) {
				throw new Error(
					`Resume missing output snapshot for ${edge.fromNodeId}.${fromPortId}`,
				);
			}

			// Resolve source (bypass or regular). Prefer the telemetry-tapped
			// wrapper from `watchedByKey` so `output-emitted` rides the dataflow
			// path and fires as part of delivery (no separate subscriber, so it
			// stays ordered before the downstream `input-received`). Bypass
			// outputs were previously connected raw, which silently dropped all
			// telemetry — see BUG CASE 1. Fall back to the raw port connection
			// only when no tap was built for this slot.
			const tappedSource = watchedByKey.get(fromKey);
			let source:
				StatefulObservable<unknown, unknown, PortMeta> | undefined;
			if (tappedSource !== undefined) {
				source = tappedSource;
			} else if (isBypassPort(fromNode, fromPortId)) {
				source = getBypassConnection(
					fromNode,
					fromPortId,
					fromSlotIndex,
				);
			} else {
				source = fromNode.outputs[fromPortId];
			}

			// Resolve input (bypass or regular)
			let input:
				StatefulConnection<unknown, unknown, PortMeta> | undefined;
			if (isBypassPort(toNode, toPortId)) {
				input = getBypassConnection(toNode, toPortId, toSlotIndex);
			} else {
				input = toNode.inputs[toPortId];
			}

			if (source === undefined || input === undefined) {
				throw new Error(`Edge ${edge.edgeId} references missing port`);
			}

			const inputMeta = input.meta;

			if (inputMeta.portId !== toPortId) {
				throw new Error(
					`Edge ${edge.edgeId} targets mismatched input port ${toPortId}`,
				);
			}

			// Handle merge/combine/zip modes (non-bypass)
			if (
				inputMeta.mode === 'merge' ||
				inputMeta.mode === 'combine' ||
				inputMeta.mode === 'zip'
			) {
				const groupKey = slotKey(edge.toNodeId, toPortId, 0);
				let group = multyInputGroups.get(groupKey);

				if (group === undefined) {
					group = {
						nodeId: edge.toNodeId,
						portId: toPortId,
						mode: inputMeta.mode,
						connection: input,
						edges: [],
					};
					multyInputGroups.set(groupKey, group);
				}

				group.edges.push({ edge, source });
				wiredSlotKeys.add(toKey);
				continue;
			}

			// Bypass mode: connect directly, no combining (pure forward). The
			// source may already be the telemetry-tapped wrapper, in which case
			// `output-emitted` still rides the dataflow path — the tap mirrors
			// the raw connection's loading, so a pure forward is preserved.
			if (inputMeta.mode === 'bypass') {
				input.connect(source);
				wiredSlotKeys.add(toKey);
				wiredSlots.push({ edgeId: edge.edgeId, connection: input });
				continue;
			}

			// Single mode
			if (toSlotIndex !== 0) {
				throw new Error(
					`Edge ${edge.edgeId} slot ${toSlotIndex} out of range`,
				);
			}

			if (inputMeta.mode !== 'single') {
				throw new Error(
					`Edge ${edge.edgeId} targets mismatched input port ${toPortId}`,
				);
			}

			input.connect(
				this.tapInputPort(
					run,
					edge.toNodeId,
					toPortId,
					toSlotIndex,
					source,
					[edge.edgeId],
				),
			);
			wiredSlotKeys.add(toKey);
			wiredSlots.push({ edgeId: edge.edgeId, connection: input });
		}

		for (const group of multyInputGroups.values()) {
			const orderedEdges = [...group.edges].sort(
				(left, right) => left.edge.toPort[1] - right.edge.toPort[1],
			);
			const sources = orderedEdges.map(({ source }) => source);
			const meta = {
				dir: 'out',
				portId: group.portId,
				wireType: 'any',
			} satisfies PortMeta;

			const combined =
				group.mode === 'combine'
					? combineStatefulObservables(
							sources,
							(values) => values,
						).with({ meta })
					: group.mode === 'zip'
						? // Zip mode: emit an array only when every slot has a *new*
							// success value (flush after emit). Same loader pattern as
							// merge (BUG-2026-07-15c).
							statefulObservable({
								loader: () =>
									zip(...sources.map((s) => s.value$)),
							}).with({ meta })
						: // Merge mode: forward each source's success value as it arrives
							// (flatten), NOT a combineLatest → array. The merged stream must be
							// returned from a `loader` (runs once) — passing it as `input`
							// makes @rx-evo re-subscribe on every emission.
							// Blocked on @rx-evo: no public merge-of-raw$ / fillStatefulObservable
							// (BUG-2026-07-15c). Documented on PortMeta.mode 'merge' in types.ts.
							statefulObservable({
								loader: () =>
									merge(...sources.map((s) => s.value$)),
							}).with({ meta });

			group.connection.connect(
				combined.pipe(
					tap({
						next: (response: unknown) => {
							const resolved = resolveSignalState(response);

							if (resolved === null) {
								return;
							}

							this.emitPortEvent(
								run.runId,
								'in',
								group.nodeId,
								group.portId,
								0,
								resolved.state,
								resolved.value,
								group.edges.map((entry) => entry.edge.edgeId),
							);
						},
					}),
				),
			);
			wiredSlots.push({
				edgeId: `multy:${group.nodeId}.${group.portId}` as EdgeId,
				connection: group.connection,
			});
		}

		// Subscribe end-node outputs *before* defaults/seeds so multi-value
		// shared streams (shareReplay bufferSize 1) still deliver every chunk
		// to unwired ports such as LLM `reasoning` / `draftResponse`. Seeds
		// must not emit while only edge-driven outputs are subscribed.
		for (const key of scopeOutputKeys) {
			if ((outputEdgeIds.get(key) ?? []).length > 0) {
				continue;
			}

			const watched = watchedByKey.get(key);

			if (watched !== undefined) {
				run.subscriptions.add(watched.subscribe(() => {}));
			}
		}

		const defaultScopeNodeIds =
			completedNodeIds.size === 0
				? scopeNodeIds
				: new Set(
						[...scopeNodeIds].filter(
							(nodeId) => !completedNodeIds.has(nodeId),
						),
					);

		wiredSlots.push(
			...this.applyPortDefaults(
				runId,
				defaultScopeNodeIds,
				wiredSlotKeys,
			),
			...this.applySeeds(runId, initialPayload ?? {}, wiredSlotKeys),
		);

		return run;
	}
}
