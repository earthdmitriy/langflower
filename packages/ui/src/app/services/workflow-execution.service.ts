import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	EdgeId,
	PortTelemetry,
	ResponseDto,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry, isPortValueTelemetry } from '@langflower/runtime';
import type {
	PaletteNodeDefinition,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import {
	combineLatest,
	EMPTY,
	interval,
	merge,
	of,
	type Observable,
} from 'rxjs';
import { filter, map, scan, shareReplay, startWith } from 'rxjs/operators';
import {
	createLastActivityByNode$,
	type LivenessState,
} from './execution-liveness-fold.js';
import { paletteByType as paletteNodesByType } from './bridge-diagram.service';
import {
	graphHasPlainStartTargets,
	nodeClusterRequiresChatEntry,
} from './chat-entry-clusters';
import {
	nodeLabelsFromWorkflow,
	nodeTypeByIdFromWorkflow,
} from './execution-catalog';
import {
	createEdgeStates$,
	type OutputPortTelemetry,
} from './execution-chrome-fold';
import { createLiveGraph$ } from './execution-live-graph-fold';
import { createIsRunning$ } from './execution-run-gate-fold';
import {
	emptyCustomPaletteSnapshot,
	mergePaletteCatalogs,
} from '../features/palette/types/palette-projection';
import { LangflowerBridgeService } from './langflower-bridge.service';

type InputPortTelemetry = PortTelemetry & {
	readonly 0: 'in';
	readonly 2: string;
	readonly 3: { readonly value: unknown };
};

/**
 * Cross-feature execution façade: feed values, edges, run gate, live graph.
 * Canvas **node** chrome lives in {@link CanvasNodeStatusService}.
 * Composer HITL lives in `features/composer` (`ComposerService`).
 *
 * Fold pipelines live in sibling `execution-*-fold.ts` / `execution-catalog.ts`.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowExecutionService {
	private readonly bridge = inject(LangflowerBridgeService);

	private readonly paletteSnapshot$ = combineLatest([
		this.bridge.cached['palette.snapshot'],
		this.bridge.cached['customPalette.snapshot'].pipe(
			startWith(emptyCustomPaletteSnapshot),
		),
	]).pipe(
		map(([system, custom]) => mergePaletteCatalogs(system, custom)),
		shareReplay(1),
	);
	private readonly workflowSnapshot$ =
		this.bridge.cached['workflow.current.snapshot'];
	private readonly executionFeedSnapshot$ =
		this.bridge.cached['executionFeed.snapshot'];
	private readonly runnerPort$: Observable<PortTelemetry> = this.bridge.raw[
		'runner.port'
	].pipe(
		filter((event: RuntimeRunnerEvent): event is PortTelemetry =>
			isPortTelemetry(event),
		),
	);
	private readonly outputEmitted$ = this.runnerPort$.pipe(
		filter((event): event is OutputPortTelemetry => event[0] === 'out'),
	);
	private readonly runnerStarted$ = this.bridge.raw['runner.started'].pipe(
		filter((id): id is RunId => typeof id === 'string'),
	);
	private readonly runnerStartNodeStarted$ = this.bridge.raw[
		'runner.startNode.started'
	].pipe(filter((id): id is RunId => typeof id === 'string'));
	private readonly runnerDone$ = this.bridge.raw['runner.done'];
	private readonly runnerInterrupted$ = this.bridge.raw['runner.interrupted'];

	private readonly paletteByType$ = this.paletteSnapshot$.pipe(
		map((snap) => paletteNodesByType(snap.nodes)),
		startWith(new Map<string, PaletteNodeDefinition>()),
		shareReplay(1),
	);

	private readonly nodeTypeById$ = this.workflowSnapshot$.pipe(
		map((snap) => nodeTypeByIdFromWorkflow(snap)),
		startWith(new Map<string, string>()),
		shareReplay(1),
	);

	private readonly activeGraph$ = createLiveGraph$({
		workflowSnapshot$: this.workflowSnapshot$,
		addNodes$: this.bridge.raw['editor.addNodes'] ?? EMPTY,
		updateNodes$: this.bridge.raw['editor.updateNodes'] ?? EMPTY,
		deleteNodes$: this.bridge.raw['editor.deleteNodes'] ?? EMPTY,
		addEdges$: this.bridge.raw['editor.addEdges'] ?? EMPTY,
		deleteEdges$: this.bridge.raw['editor.deleteEdges'] ?? EMPTY,
	});

	private readonly nodeLabels$ = merge(
		of(new Map<string, string>()),
		combineLatest([this.workflowSnapshot$, this.paletteSnapshot$]).pipe(
			map(([workflowSnap, paletteSnap]) =>
				nodeLabelsFromWorkflow(
					workflowSnap,
					paletteNodesByType(paletteSnap.nodes),
				),
			),
		),
	).pipe(shareReplay(1));

	private readonly paletteByType = toSignal(this.paletteByType$, {
		initialValue: new Map<string, PaletteNodeDefinition>(),
	});
	private readonly nodeTypeById = toSignal(this.nodeTypeById$, {
		initialValue: new Map<string, string>(),
	});
	private readonly nodeLabels = toSignal(this.nodeLabels$, {
		initialValue: new Map<string, string>(),
	});

	/**
	 * Live active graph (snapshot seed + `editor.updateNodes` / add / delete).
	 */
	readonly activeGraph = toSignal(this.activeGraph$, {
		initialValue: null as WorkflowPersistedGraph | null,
	});

	readonly hasRunnableGraph = computed(() => this.nodeTypeById().size > 0);

	readonly hasPlainStartTargets = computed(() => {
		const graph = this.activeGraph();
		if (graph === null) {
			return false;
		}
		return graphHasPlainStartTargets(graph, this.paletteByType());
	});

	private readonly latestOutputValues = toSignal(
		merge(
			this.executionFeedSnapshot$.pipe(
				map((snapshot) => ({
					type: 'snapshot' as const,
					events: snapshot?.events ?? [],
				})),
			),
			this.outputEmitted$.pipe(
				map((event) => ({ type: 'event' as const, event })),
			),
		).pipe(
			scan((values, action) => {
				if (action.type === 'snapshot') {
					const next = new Map<string, unknown>();
					for (const event of action.events) {
						if (
							isPortValueTelemetry(event) &&
							event[0] === 'out' &&
							typeof event[2] === 'string'
						) {
							next.set(`${event[1]}:${event[2]}`, event[3].value);
						}
					}
					return next;
				}
				const [, nodeId, portId, response] = action.event;
				if (typeof portId !== 'string' || !('value' in response)) {
					return values;
				}
				const next = new Map(values);
				next.set(`${nodeId}:${portId}`, response.value);
				return next;
			}, new Map<string, unknown>()),
		),
		{ initialValue: new Map<string, unknown>() },
	);

	private readonly lastActivityByNode$ = createLastActivityByNode$({
		outputEmitted$: this.outputEmitted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
		executionFeedSnapshot$: this.executionFeedSnapshot$,
	});

	private readonly lastActivityByNode = toSignal(this.lastActivityByNode$, {
		initialValue: new Map() as LivenessState,
	});

	readonly livenessNowMs = toSignal(
		interval(1000).pipe(map(() => Date.now())),
		{
			initialValue: Date.now(),
		},
	);

	readonly isRunning$ = createIsRunning$({
		executionFeedSnapshot$: this.executionFeedSnapshot$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
		runnerDone$: this.runnerDone$,
		runnerInterrupted$: this.runnerInterrupted$,
	});

	readonly isRunning = toSignal(this.isRunning$, { initialValue: false });

	private readonly edgeStates$ = createEdgeStates$({
		executionFeedSnapshot$: this.executionFeedSnapshot$,
		outputEmitted$: this.outputEmitted$,
		runnerStarted$: this.runnerStarted$,
		runnerStartNodeStarted$: this.runnerStartNodeStarted$,
	});

	readonly edgeStates = toSignal(this.edgeStates$, {
		initialValue: new Map<EdgeId, ResponseDto<unknown>>(),
	});

	latestOutputValue(nodeId: string, portId: string): unknown {
		return this.latestOutputValues().get(`${nodeId}:${portId}`);
	}

	nodeClusterRequiresChatEntry(nodeId: string): boolean {
		const graph = this.activeGraph();
		if (graph === null) {
			return false;
		}
		return nodeClusterRequiresChatEntry(
			graph,
			this.paletteByType(),
			nodeId,
		);
	}

	nodeLabel(nodeId: string): string {
		return this.nodeLabels().get(nodeId) ?? nodeId;
	}

	lastActivityMs(nodeId: string): number | undefined {
		return this.lastActivityByNode().get(nodeId);
	}

	wireStatus(edgeId: string): ResponseDto<unknown> {
		return this.edgeStates().get(edgeId as EdgeId) ?? { inactive: true };
	}

	getEventsForEdge(edgeId: string): Observable<OutputPortTelemetry> {
		return this.outputEmitted$.pipe(
			filter((event) => event[5].some((id) => id === edgeId)),
		);
	}

	getEventsForPort(
		nodeId: string,
		portId: string,
	): Observable<OutputPortTelemetry> {
		return this.runnerPort$.pipe(
			filter(
				(event): event is OutputPortTelemetry =>
					event[0] === 'out' &&
					event[1] === nodeId &&
					event[2] === portId,
			),
		);
	}

	getInputEventsForPort(
		nodeId: string,
		portId: string,
	): Observable<InputPortTelemetry> {
		return this.runnerPort$.pipe(
			filter(
				(event): event is InputPortTelemetry =>
					event[0] === 'in' &&
					event[1] === nodeId &&
					event[2] === portId,
			),
		);
	}
}
