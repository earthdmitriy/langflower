import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type {
	EdgeId,
	PortTelemetry,
	ResponseDto,
	RunId,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
import { isPortTelemetry } from '@langflower/runtime';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import type { WorkflowPersistedGraph } from '@langflower/shared/types/langflower-workflow';
import {
	combineLatest,
	EMPTY,
	interval,
	merge,
	of,
	type Observable,
} from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';
import {
	createLastActivityByNode$,
	type LivenessState,
} from './execution-liveness-fold.js';
import {
	mergedPaletteFromSnapshots$,
	nodeLabelsFromWorkflow,
	paletteByType as paletteNodesByType,
} from './execution-catalog';
import {
	graphHasPlainStartTargets,
	nodeClusterRequiresChatEntry,
} from './chat-entry-clusters';
import {
	createEdgeStates$,
	type InputPortTelemetry,
	type OutputPortTelemetry,
} from './execution-chrome-fold';
import { createLiveGraph$ } from './execution-live-graph-fold';
import { createLatestOutputValues$ } from './execution-output-values-fold';
import { createIsRunning$ } from './execution-run-gate-fold';
import { LangflowerBridgeService } from './langflower-bridge.service';

/**
 * Cross-feature execution façade: last output values, edges, run gate, live graph.
 * Canvas **node** chrome lives in {@link CanvasNodeStatusService}.
 * Composer HITL lives in `features/composer` (`ComposerService`).
 *
 * Fold pipelines live in sibling `execution-*-fold.ts` / `execution-catalog.ts`.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowExecutionService {
	private readonly bridge = inject(LangflowerBridgeService);

	/** Wait for real system + custom snapshots — no empty custom startWith. */
	private readonly paletteSnapshot$ = mergedPaletteFromSnapshots$(
		this.bridge.cached['palette.snapshot'],
		this.bridge.cached['customPalette.snapshot'],
	).pipe(shareReplay(1));
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
	private readonly nodeLabels = toSignal(this.nodeLabels$, {
		initialValue: new Map<string, string>(),
	});

	/**
	 * Live active graph (snapshot seed + `editor.updateNodes` / add / delete).
	 */
	readonly activeGraph = toSignal(this.activeGraph$, {
		initialValue: null as WorkflowPersistedGraph | null,
	});

	readonly hasRunnableGraph = computed(
		() => (this.activeGraph()?.nodes.length ?? 0) > 0,
	);

	/** False until the merged catalog emits (system palette is never empty). */
	readonly hasPaletteCatalog = computed(() => this.paletteByType().size > 0);

	readonly hasPlainStartTargets = computed(() => {
		const graph = this.activeGraph();
		const palette = this.paletteByType();
		if (graph === null || palette.size === 0) {
			return false;
		}
		return graphHasPlainStartTargets(graph, palette);
	});

	private readonly latestOutputValues = toSignal(
		createLatestOutputValues$({
			executionFeedSnapshot$: this.executionFeedSnapshot$,
			outputEmitted$: this.outputEmitted$,
		}),
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
		const palette = this.paletteByType();
		if (graph === null || palette.size === 0) {
			return false;
		}
		return nodeClusterRequiresChatEntry(graph, palette, nodeId);
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
