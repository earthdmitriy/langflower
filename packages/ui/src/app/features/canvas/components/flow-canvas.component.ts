import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	ElementRef,
	inject,
	Injector,
	input,
	untracked,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type {
	EditorPasteRequestedPayload,
	PaletteConfigPayload,
	WorkflowPersistedGraph,
} from '@langflower/shared/langflower';
import type { NodeId } from '@langflower/runtime';
import {
	ClipboardPastedEvent,
	EdgeDrawEndedEvent,
	initializeModel,
	NgDiagramBackgroundComponent,
	NgDiagramComponent,
	NgDiagramConfig,
	NgDiagramEdgeTemplateMap,
	NgDiagramMinimapComponent,
	NgDiagramModelService,
	NgDiagramNodeService,
	NgDiagramNodeTemplateMap,
	NgDiagramSelectionService,
	NgDiagramService,
	NgDiagramViewportService,
	NodeDragEndedEvent,
	NodeResizeEndedEvent,
	provideNgDiagram,
	SelectionChangedEvent,
	SelectionRemovedEvent,
	type Node,
} from 'ng-diagram';
import { combineLatest, Observable, ObservedValueOf } from 'rxjs';
import {
	debounceTime,
	distinctUntilChanged,
	filter,
	skip,
} from 'rxjs/operators';
import {
	gateCanvasViewportPublish,
	sameCanvasViewport,
} from '../utils/canvas-viewport-sync.js';
import {
	fromInputPortId,
	fromOutputPortId,
	splitSlotHandle,
} from '../../../diagram/diagram-port-id.js';
import {
	paletteByType,
	persistedEdgeToDiagram,
	persistedNodeToDiagram,
	portsConfigForType,
} from '../../../services/bridge-diagram.service';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { PALETTE_DRAG_ANCHOR_OFFSET_PX } from '../../palette/utils/palette-drag-layout.js';
import { PALETTE_DRAG_MIME } from '../../palette/utils/palette-drag-mime.js';
import { NodeContentMinSizeService } from '../services/node-content-min-size.service.js';
import { createBackEdgeAwareOrthogonalRouting } from '../utils/back-edge-aware-orthogonal-routing.js';
import { getBuiltinOrthogonalRouting } from '../utils/get-builtin-orthogonal-routing.js';
import { withPreviewDefaultDropPosition } from '../utils/preview-node-default-size.js';
import { LfEdgeChromeComponent } from './lf-edge-chrome.component.js';
import { LfNodeComponent, type LfNodeData } from './lf-node.component.js';

type AddEdgeRequestedPayload = {
	readonly fromNodeId: NodeId;
	readonly fromPort: readonly [string, number];
	readonly toNodeId: NodeId;
	readonly toPort: readonly [string, number];
};

/**
 * Composer step: parse draw-ended ports into a server addEdge intent.
 * Returns null when ports are incomplete.
 */
const buildAddEdgeIntentFromDrawEnded = (
	event: EdgeDrawEndedEvent,
): AddEdgeRequestedPayload | null => {
	if (event.edge === undefined) {
		return null;
	}

	const sourcePort = event.sourcePort ?? event.edge.sourcePort;
	const targetPort = event.targetPort ?? event.edge.targetPort;

	if (sourcePort === undefined || targetPort === undefined) {
		return null;
	}

	const fromHandle = splitSlotHandle(fromOutputPortId(sourcePort));
	const toHandle = splitSlotHandle(fromInputPortId(targetPort));

	return {
		fromNodeId: event.edge.source as NodeId,
		fromPort: [fromHandle.basePortId, fromHandle.slotIndex],
		toNodeId: event.edge.target as NodeId,
		toPort: [toHandle.basePortId, toHandle.slotIndex],
	};
};

/** Composer: strip-ready paste batch from ng-diagram optimistic clones. */
const buildPasteRequestedFromClipboard = (
	event: ClipboardPastedEvent,
): EditorPasteRequestedPayload => {
	const nodes = event.nodes.map((node) => {
		const data = node.data as LfNodeData;
		const width = node.size?.width ?? data.ui.position.width;
		const height = node.size?.height ?? data.ui.position.height;

		return {
			clientId: node.id,
			type: data.type,
			position: {
				x: node.position.x,
				y: node.position.y,
				...(width !== undefined ? { width } : {}),
				...(height !== undefined ? { height } : {}),
			},
			params: data.params,
			inputs: data.inputs,
			...(data.ui.label !== undefined ? { label: data.ui.label } : {}),
		};
	});

	const pastedNodeIds = new Set(nodes.map((node) => node.clientId));

	const edges = event.edges.flatMap((edge) => {
		if (
			!pastedNodeIds.has(edge.source) ||
			!pastedNodeIds.has(edge.target) ||
			edge.sourcePort === undefined ||
			edge.targetPort === undefined
		) {
			return [];
		}

		const fromHandle = splitSlotHandle(fromOutputPortId(edge.sourcePort));
		const toHandle = splitSlotHandle(fromInputPortId(edge.targetPort));

		return [
			{
				fromClientId: edge.source,
				fromPort: [
					fromHandle.basePortId,
					fromHandle.slotIndex,
				] as const,
				toClientId: edge.target,
				toPort: [toHandle.basePortId, toHandle.slotIndex] as const,
			},
		];
	});

	return { nodes, edges };
};

@Component({
	selector: 'lf-flow-canvas',
	standalone: true,
	imports: [
		NgDiagramComponent,
		NgDiagramBackgroundComponent,
		NgDiagramMinimapComponent,
	],
	providers: [provideNgDiagram()],
	template: `
		<div
			class="relative h-full w-full"
			(dragover)="hostHandlers.handleDragOver($event)"
			(drop)="hostHandlers.handleDrop($event)"
		>
			@if (modelAdapter(); as modelAdapter) {
				<ng-diagram
					class="block h-full w-full "
					style="background: transparent"
					[model]="modelAdapter"
					[config]="config"
					[nodeTemplateMap]="nodeTemplateMap"
					[edgeTemplateMap]="edgeTemplateMap"
					(diagramInit)="handlers.handleDiagramInit()"
					(nodeDragEnded)="handlers.handleNodeDragEnded($event)"
					(nodeResizeEnded)="handlers.handleNodeResizeEnded($event)"
					(edgeDrawEnded)="handlers.handleEdgeDrawEnded($event)"
					(clipboardPasted)="handlers.handleClipboardPasted($event)"
					(selectionRemoved)="handlers.handleSelectionRemoved($event)"
					(selectionChanged)="handlers.handleSelectionChanged($event)"
				>
					<ng-diagram-background type="dots" /> <ng-diagram-minimap
				/></ng-diagram>
			} @else {
				<div
					class="flex h-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400"
				>
					Waiting for workflow…
				</div>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowCanvasComponent {
	/**
	 * Seed graph for `initializeModel` (and hydrate viewport compare).
	 *
	 * Bound from `workflow.current.snapshot` — not from incremental
	 * `editor.*` deltas — so it does not track live topology after init.
	 * Parent remounts this component when the active workflow id changes;
	 * same-id snapshot reseeds still re-run `modelAdapter` and reset the
	 * viewport hydrate gate. Do NOT read `graphInput()` for live edges/nodes
	 * — those live in `NgDiagramModelService`.
	 *
	 * Palette is **not** a model-seed dependency: catalog refresh patches
	 * live `portsConfig` only (see constructor).
	 */
	readonly graphInput = input.required<WorkflowPersistedGraph>();
	readonly palette = input.required<PaletteConfigPayload>();

	private readonly destroyRef = inject(DestroyRef);
	private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly injector = inject(Injector);
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly execution = inject(WorkflowExecutionService);
	private readonly viewportService = inject(NgDiagramViewportService);
	private readonly viewport$ = toObservable(this.viewportService.viewport);

	private readonly diagramModel = inject(NgDiagramModelService);
	private readonly diagramService = inject(NgDiagramService);
	private readonly nodeService = inject(NgDiagramNodeService);
	private readonly selectionService = inject(NgDiagramSelectionService);
	private readonly contentMinSize = inject(NodeContentMinSizeService);
	/**
	 * Server-confirmed selection — loop guard for `(selectionChanged)` vs.
	 * `editor.nodeSelected`: updated (before reconciling the diagram) on every
	 * incoming snapshot/broadcast, and read to skip re-sending a request for
	 * a selection change caused by our own reconciliation. `undefined` (never
	 * confirmed yet) is distinct from `null` (server-confirmed "nothing
	 * selected") so the very first deselect is never mistakenly swallowed.
	 */
	private lastConfirmedSelectedNodeId: string | null | undefined = undefined;

	config = {
		zoom: {
			max: 2,
			zoomToFit: {
				padding: 100,
			},
		},
		snapping: {
			shouldSnapDragForNode: () => true,
			computeSnapForNodeDrag: () => ({ width: 20, height: 20 }),
			defaultDragSnap: { width: 20, height: 20 },
		},
		resize: {
			getMinNodeSize: (node: Node) => this.contentMinSize.minFor(node.id),
		},
	} satisfies NgDiagramConfig;

	readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
		['lf-node', LfNodeComponent],
	]);

	readonly edgeTemplateMap = new NgDiagramEdgeTemplateMap([
		['lf-edge', LfEdgeChromeComponent],
	]);

	readonly modelAdapter = computed(() => {
		const graph = this.graphInput();
		// Palette must not reseed the ng-diagram model — catalog refresh
		// patches `portsConfig` on live nodes (constructor subscription).
		const palette = untracked(() => this.palette());

		return initializeModel(
			{
				nodes: graph.nodes.map((node) =>
					persistedNodeToDiagram(node, paletteByType(palette.nodes)),
				),
				edges: graph.edges.map(persistedEdgeToDiagram),
				metadata: {
					viewport: graph.viewport,
				},
			},
			this.injector,
		);
	});

	constructor() {
		// Seed graph identity for hydrate gating. Live pan lives in
		// NgDiagramViewportService. When parent reseeds the graph (same
		// canvas instance), reset the gate so the first post-reseed
		// viewport is never published as a user pan (BUG-2026-07-20 /
		// 06-26i). Palette-only refreshes must not reset this gate.
		// Do not read required inputs() in the constructor (NG8118) — seed
		// on the first viewport tick inside the pipe.
		let hydrateConsumed = false;
		let seedGraph: ReturnType<typeof this.graphInput> | undefined;

		this.viewport$
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				debounceTime(300),
				distinctUntilChanged(sameCanvasViewport),
				filter((viewport) => {
					const graph = this.graphInput();
					if (seedGraph === undefined || graph !== seedGraph) {
						seedGraph = graph;
						hydrateConsumed = false;
					}
					const gate = gateCanvasViewportPublish(
						viewport,
						graph.viewport,
						hydrateConsumed,
					);
					hydrateConsumed = gate.hydrateConsumed;
					return gate.publish;
				}),
			)
			.subscribe((viewport) => {
				this.bridge.raw['editor.viewport.requested'].next(viewport);
			});

		// Subsequent palette snapshots update static port metadata only —
		// never `initializeModel` (BUG-2026-07-22a).
		toObservable(this.palette)
			.pipe(skip(1), takeUntilDestroyed(this.destroyRef))
			.subscribe((palette) => {
				this.applyPalettePortsToLiveNodes(palette);
			});

		const subscribe = <T extends keyof (typeof this.bridge)['raw']>(
			key: T,
			callback: (
				arg: ObservedValueOf<(typeof this.bridge)['raw'][T]>,
			) => void,
		) =>
			combineLatest([
				this.bridge.raw[key] as Observable<
					ObservedValueOf<(typeof this.bridge)['raw'][T]>
				>,
			])
				.pipe(takeUntilDestroyed())
				.subscribe(([payload]) => callback(payload));

		subscribe('editor.addEdges', (edges) => {
			this.diagramModel.addEdges(edges.map(persistedEdgeToDiagram));
		});

		subscribe('editor.viewport.delta', (viewport) => {
			if (!viewport) return;

			const { x, y, scale } = viewport;
			const current = this.viewportService.viewport();

			if (x === current.x && y === current.y && scale === current.scale)
				return;

			this.viewportService.setViewport(x, y, scale);
		});

		subscribe('editor.deleteEdges', (edges) => {
			this.diagramModel.deleteEdges(edges.map((edge) => edge.edgeId));
		});

		subscribe('editor.deleteNodes', (nodes) => {
			this.diagramModel.deleteNodes(nodes.map((e) => e.id));
		});

		subscribe('editor.addNodes', (nodes) => {
			const diagramNodes = nodes.map((node) =>
				persistedNodeToDiagram(
					node,
					paletteByType(this.palette().nodes),
				),
			);
			this.diagramModel.addNodes(diagramNodes);
		});

		subscribe('editor.updateNodes', (nodes) => {
			const diagramNodes = nodes.map((node) =>
				persistedNodeToDiagram(
					node,
					paletteByType(this.palette().nodes),
				),
			);
			this.diagramModel.updateNodes(diagramNodes);
		});

		this.bridge.cached['session.state.snapshot']
			.pipe(takeUntilDestroyed())
			.subscribe((snapshot) => {
				this.applyConfirmedSelection(snapshot.selectedNode?.id ?? null);
			});

		subscribe('editor.nodeSelected', (payload) => {
			this.applyConfirmedSelection(payload.node?.id ?? null);
		});
	}

	ngAfterViewInit(): void {
		const host = this.elementRef.nativeElement;
		const options = { capture: true };

		const handleDragOver = (event: DragEvent) => {
			if (!this.isPaletteDrag(event)) {
				return;
			}

			event.stopImmediatePropagation();
			this.hostHandlers.handleDragOver(event);
		};

		const handleDrop = (event: DragEvent) => {
			if (!this.isPaletteDrag(event)) {
				return;
			}

			event.stopImmediatePropagation();
			this.hostHandlers.handleDrop(event);
		};

		host.addEventListener('dragover', handleDragOver, options);
		host.addEventListener('drop', handleDrop, options);

		this.destroyRef.onDestroy(() => {
			host.removeEventListener('dragover', handleDragOver, options);
			host.removeEventListener('drop', handleDrop, options);
		});
	}

	readonly hostHandlers = {
		handleDragOver: (event: DragEvent) => {
			if (!this.isPaletteDrag(event)) {
				return;
			}

			const dataTransfer = event.dataTransfer;

			if (dataTransfer === null) {
				return;
			}

			event.preventDefault();
			dataTransfer.dropEffect = this.execution.isRunning()
				? 'none'
				: 'copy';
		},

		handleDrop: (event: DragEvent) => {
			if (this.execution.isRunning()) {
				event.preventDefault();
				return;
			}

			const nodeType = event.dataTransfer?.getData(PALETTE_DRAG_MIME);

			if (nodeType === undefined || nodeType.length === 0) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const position = this.viewportService.clientToFlowPosition({
				x: event.clientX - PALETTE_DRAG_ANCHOR_OFFSET_PX,
				y: event.clientY - PALETTE_DRAG_ANCHOR_OFFSET_PX,
			});

			this.bridge.raw['editor.addNode.requested'].next({
				type: nodeType,
				position: withPreviewDefaultDropPosition(nodeType, position),
			});
		},
	} as const;

	readonly handlers = {
		handleDiagramInit: () => {
			// Replace built-in orthogonal so back-edges re-route on every drag
			// (auto mode). Never bake below-routes via routingMode:'manual' —
			// base-edge syncs that into the model and freezes the path.
			// Capture the live built-in first (EdgeRoutingManager is not a
			// runtime export from ng-diagram).
			const builtinOrthogonal = getBuiltinOrthogonalRouting(
				this.diagramService,
			);
			this.diagramService.registerRouting(
				createBackEdgeAwareOrthogonalRouting(
					builtinOrthogonal,
					(sourceId, targetId) =>
						this.diagramModel
							.edges()
							.some(
								(edge) =>
									edge.source === targetId &&
									edge.target === sourceId,
							),
				),
			);

			const stuckManual = this.diagramModel
				.edges()
				.filter((edge) => edge.routingMode === 'manual')
				.map((edge) => ({
					id: edge.id,
					routingMode: 'auto' as const,
				}));
			if (stuckManual.length > 0) {
				this.diagramModel.updateEdges(stuckManual);
			}
		},

		handleNodeDragEnded: (event: NodeDragEndedEvent) => {
			for (const node of event.nodes) {
				this.bridge.raw['editor.updateNode.requested'].next({
					nodeId: node.id as NodeId,
					position: {
						x: node.position.x,
						y: node.position.y,
					},
				});
			}
		},

		handleNodeResizeEnded: (event: NodeResizeEndedEvent) => {
			const size = event.node.size;

			if (size === undefined) {
				return;
			}

			const min = this.contentMinSize.minFor(event.node.id);
			const width = Math.max(size.width, min.width);
			const height = Math.max(size.height, min.height);

			if (width !== size.width || height !== size.height) {
				this.nodeService.resizeNode(
					event.node.id,
					{ width, height },
					undefined,
					true,
				);
			}

			this.bridge.raw['editor.updateNode.requested'].next({
				nodeId: event.node.id as NodeId,
				ui: {
					width,
					height,
				},
			});
		},

		handleEdgeDrawEnded: (event: EdgeDrawEndedEvent) => {
			if (!event.success || event.edge === undefined) {
				return;
			}

			// 1. Strip optimistic preview edge from the local diagram
			this.diagramModel.deleteEdges([event.edge.id]);

			// 2. Build authoritative addEdge intent
			const intent = buildAddEdgeIntentFromDrawEnded(event);

			if (intent === null) {
				return;
			}

			// 3. Request server add (broadcast delta comes back via bridge)
			this.bridge.raw['editor.addEdge.requested'].next(intent);
		},

		handleClipboardPasted: (event: ClipboardPastedEvent) => {
			if (event.nodes.length === 0) {
				return;
			}

			// 1. Strip optimistic local clones (same pattern as edge draw)
			const edgeIds = event.edges.map((edge) => edge.id);
			const nodeIds = event.nodes.map((node) => node.id);

			if (edgeIds.length > 0) {
				this.diagramModel.deleteEdges(edgeIds);
			}

			this.diagramModel.deleteNodes(nodeIds);

			// 2. Server-authoritative paste (all tabs apply addNodes/addEdges)
			this.bridge.raw['editor.paste.requested'].next(
				buildPasteRequestedFromClipboard(event),
			);
		},

		handleSelectionRemoved: (event: SelectionRemovedEvent) => {
			for (const edge of event.deletedEdges) {
				this.bridge.raw['editor.removeEdge.requested'].next(edge.id);
			}

			for (const node of event.deletedNodes) {
				this.bridge.raw['editor.removeNode.requested'].next(node.id);
			}
		},

		handleSelectionChanged: (event: SelectionChangedEvent) => {
			const nodeId = (event.selectedNodes[0]?.id ??
				null) as NodeId | null;

			if (nodeId === this.lastConfirmedSelectedNodeId) {
				return;
			}

			this.bridge.raw['editor.selectNode.requested'].next({ nodeId });
		},
	} as const;

	/**
	 * Applies a server-confirmed selection id — sets the loop guard first,
	 * then reconciles ng-diagram's own selection only when it actually
	 * differs (avoids `selectionChanged` → request → broadcast → apply →
	 * `selectionChanged` ping-pong; also makes this tab's canvas highlight
	 * a node selected from another tab).
	 */
	/**
	 * Apply a refreshed palette catalog to live diagram nodes without
	 * reseeding `modelAdapter` / `initializeModel`.
	 */
	private applyPalettePortsToLiveNodes(palette: PaletteConfigPayload): void {
		const catalog = paletteByType(palette.nodes);
		const updates = this.diagramModel
			.nodes()
			.map((node) => {
				const typed = node as Node<LfNodeData>;
				const portsConfig = portsConfigForType(
					typed.data.type,
					catalog,
				);
				if (typed.data.portsConfig === portsConfig) {
					return null;
				}
				return {
					...typed,
					data: {
						...typed.data,
						portsConfig,
					},
				};
			})
			.filter((node): node is Node<LfNodeData> => node !== null);

		if (updates.length > 0) {
			this.diagramModel.updateNodes(updates);
		}
	}

	private applyConfirmedSelection(nodeId: string | null): void {
		this.lastConfirmedSelectedNodeId = nodeId;

		const currentlySelectedId =
			this.selectionService.selection().nodes[0]?.id ?? null;

		if (currentlySelectedId === nodeId) {
			return;
		}

		if (nodeId === null) {
			this.selectionService.deselectAll();
			return;
		}

		this.selectionService.select([nodeId]);
	}

	private isPaletteDrag(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes(PALETTE_DRAG_MIME) === true;
	}
}
