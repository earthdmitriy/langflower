import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	HostListener,
	inject,
	Injector,
	input,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { WorkflowNodePersisted } from '@langflower/shared/langflower';
import type { NodeId } from '@langflower/runtime';
import {
	NgDiagramModelService,
	NgDiagramNodeResizeAdornmentComponent,
	NgDiagramNodeService,
	NgDiagramSelectionService,
	NgDiagramViewportService,
	type SimpleNode,
} from 'ng-diagram';
import { map, switchMap } from 'rxjs';
import { fromOutputPortId } from '../../../diagram/diagram-port-id.js';
import {
	resolveNodePorts,
	type PortsConfig,
} from '../../../diagram/resolve-diagram-node-ports.js';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { NodeHoverService } from '../../../services/node-hover.service';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { NodeContentMinSizeService } from '../services/node-content-min-size.service.js';
import { NodePreviewValuesService } from '../services/node-preview-values.service.js';
import { measureNodeContentMinHeightPx } from '../utils/measure-node-content-min-size.js';
import { sizeFromSeResizeDelta } from '../utils/se-node-resize-gesture.js';
import { valuePulseActive$ } from '../utils/value-pulse-active.js';
import { LfNodeBypassPortRowComponent } from './lf-node-bypass-port-row.component';
import { LfNodePortRowComponent } from './lf-node-port-row.component';

const HEIGHT_EPSILON_PX = 1;
const MIN_NODE_WIDTH_PX = 160;
const MIN_NODE_HEIGHT_PX = 72;
/** Chrome `py-3` (0.75rem × 2) around `.lf-node-content`. */
const CHROME_PAD_Y_PX = 24;

export type LfNodeData = WorkflowNodePersisted & {
	readonly portsConfig: PortsConfig;
};

const displayLabel = (data: WorkflowNodePersisted): string => {
	const custom = data.ui.label?.trim();

	return custom !== undefined && custom.length > 0 ? custom : data.type;
};

@Component({
	selector: 'lf-node',
	standalone: true,
	host: {
		class: 'lf-diagram-node',
	},
	imports: [
		LfNodePortRowComponent,
		LfNodeBypassPortRowComponent,
		NgDiagramNodeResizeAdornmentComponent,
	],
	template: `
		<ng-diagram-node-resize-adornment>
			<div
				class="lf-node-chrome rounded-xl border border-zinc-300 bg-white py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
				[attr.data-node-id]="node().id"
				[class.lf-node-chrome--selected]="node().selected ?? false"
				[class.lf-node-chrome--hovered]="hover.isHovered(node().id)"
				[class.lf-node-chrome--pending]="status() === 'pending'"
				[class.lf-node-chrome--value]="status() === 'value'"
				[class.lf-node-chrome--error]="status() === 'error'"
				[class.lf-node-chrome--hitl]="status() === 'hitl'"
				[class.lf-node-chrome--pulse]="pulse()"
				(mouseenter)="hover.set(node().id)"
				(mouseleave)="hover.clear()"
			>
				<div #content class="lf-node-content">
					@if (editingLabel()) {
						<input
							#labelInput
							class="lf-node-title lf-node-label-input mx-1 text-xs font-semibold"
							data-no-drag="true"
							data-no-pan="true"
							[value]="labelDraft()"
							(input)="labelDraft.set(labelInput.value)"
							(keydown)="onLabelKeydown($event)"
							(blur)="onLabelBlur()"
						/>
					} @else {
						<span
							class="lf-node-title truncate px-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100"
							(dblclick)="startLabelEdit()"
						>
							{{ label() }}
						</span>
					}

					@for (row of inputPortRows(); track row.portId) {
						<lf-node-port-row
							side="in"
							[nodeId]="node().id"
							[portId]="row.portId"
							[runtimePortId]="row.basePortId"
							[label]="row.label"
							[wireType]="row.wireType"
							[inline]="row.inline"
							[value]="row.value"
							[disabled]="row.connected"
							[previewValue]="previewValueFor(row.basePortId)"
							[nodeSelected]="node().selected ?? false"
							[endpointHighlighted]="
								isEndpointHighlighted(row.portId)
							"
							(valueChange)="
								onPortInlineChange(row.basePortId, $event)
							"
						/>
					}

					@for (row of bypassPortRows(); track row.handle) {
						<lf-node-bypass-port-row
							[nodeId]="node().id"
							[runtimePortId]="row.handle"
							[inputPortId]="row.inputPortId"
							[outputPortId]="row.outputPortId"
							[label]="row.label"
							[wireType]="row.wireType"
							[nodeSelected]="node().selected ?? false"
							[inputEndpointHighlighted]="
								isEndpointHighlighted(row.inputPortId)
							"
							[outputEndpointHighlighted]="
								isEndpointHighlighted(row.outputPortId)
							"
						/>
					}

					@for (row of outputPortRows(); track row.portId) {
						<lf-node-port-row
							side="out"
							[nodeId]="node().id"
							[portId]="row.portId"
							[runtimePortId]="fromOutputPortId(row.portId)"
							[label]="row.label"
							[wireType]="row.wireType"
							[nodeSelected]="node().selected ?? false"
							[endpointHighlighted]="
								isEndpointHighlighted(row.portId)
							"
						/>
					}
				</div>
				<!--
				  SE grip: own overflow clip + matching bottom-right radius so
				  chrome can stay overflow:visible for port anchors.
				-->
				<div
					class="lf-node-se-handle"
					data-no-drag="true"
					data-no-pan="true"
					(pointerdown)="onSeHandlePointerDown($event)"
				>
					<span
						class="lf-node-se-handle__lines"
						aria-hidden="true"
					></span>
				</div>
			</div>
		</ng-diagram-node-resize-adornment>
	`,
	styleUrl: './../styles/node-port-layout.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfNodeComponent {
	private readonly bridge = inject(LangflowerBridgeService);
	private readonly diagramModel = inject(NgDiagramModelService);
	private readonly nodeService = inject(NgDiagramNodeService);
	private readonly selection = inject(NgDiagramSelectionService);
	private readonly viewport = inject(NgDiagramViewportService);
	private readonly previewValues = inject(NodePreviewValuesService);
	private readonly contentMinSize = inject(NodeContentMinSizeService);
	private readonly injector = inject(Injector);
	private readonly destroyRef = inject(DestroyRef);
	readonly hover = inject(NodeHoverService);
	private readonly execution = inject(WorkflowExecutionService);

	private seResizeCleanup: (() => void) | undefined;

	readonly node = input.required<SimpleNode<LfNodeData>>();
	private readonly content = viewChild<ElementRef<HTMLElement>>('content');

	/** Steady-state execution chrome, reduced from the shared service signal. */
	readonly status = computed(() => this.execution.nodeStatus(this.node().id));

	/**
	 * Transient green flash on a delivered value — `valuePulseActive$` over
	 * this node's live `output-emitted` slice (not the reduced steady-state).
	 */
	readonly pulse = toSignal(
		toObservable(this.node).pipe(
			map((node) => node.id),
			switchMap((nodeId) =>
				valuePulseActive$(this.execution.getEventsForNode(nodeId)),
			),
		),
		{ initialValue: false },
	);

	readonly editingLabel = signal(false);
	readonly labelDraft = signal('');

	/** Last port-row count synced in mode B (width locked). */
	private lastSyncedRowCount: number | undefined = undefined;
	private heightSyncScheduled = false;
	private minSizePublishScheduled = false;

	constructor() {
		this.destroyRef.onDestroy(() => {
			this.seResizeCleanup?.();
			this.contentMinSize.clear(this.node().id);
		});

		effect(() => {
			const width = this.node().data.ui.position.width;
			const rowCount = this.portRowCount();

			untracked(() => {
				this.scheduleMinSizePublish();

				if (width === undefined) {
					this.lastSyncedRowCount = undefined;
					return;
				}

				if (this.lastSyncedRowCount === undefined) {
					this.lastSyncedRowCount = rowCount;
					return;
				}

				if (this.lastSyncedRowCount === rowCount) {
					return;
				}

				this.lastSyncedRowCount = rowCount;
				this.scheduleHeightSync();
			});
		});
	}

	@HostListener('document:keydown', ['$event'])
	onDocumentKeydown(event: KeyboardEvent): void {
		if (
			event.key === 'F2' &&
			(this.node().selected ?? false) &&
			!this.editingLabel()
		) {
			event.preventDefault();
			this.startLabelEdit();
		}
	}

	readonly fromOutputPortId = fromOutputPortId;

	readonly label = computed(() => displayLabel(this.node().data));

	/**
	 * Live edges touching this node, filtered from the reactive
	 * `NgDiagramModelService.edges` signal — NOT `getConnectedEdges()`, which
	 * reads a plain internal cache and does not trigger `computed()` reruns.
	 * Ports are derived from this on every read, so there is nothing cached
	 * on node `data` that can go stale after edge add/remove or unrelated
	 * node updates (position, params, …).
	 */
	private readonly connectedEdges = computed(() => {
		const id = this.node().id;

		return this.diagramModel
			.edges()
			.filter((edge) => edge.source === id || edge.target === id);
	});
	private readonly ports = computed(() =>
		resolveNodePorts(
			this.node().data.portsConfig,
			this.node().id,
			this.connectedEdges(),
			this.node().data.inputs,
		),
	);
	readonly inputPortRows = computed(() => this.ports().inputPorts);
	readonly outputPortRows = computed(() => this.ports().outputPorts);
	readonly bypassPortRows = computed(() => this.ports().bypassPorts);

	private readonly portRowCount = computed(
		() =>
			this.inputPortRows().length +
			this.bypassPortRows().length +
			this.outputPortRows().length,
	);

	/** Port handle ids that are endpoints of currently selected edges. */
	private readonly selectedEndpointPortIds = computed(() => {
		const id = this.node().id;
		const ports = new Set<string>();

		for (const edge of this.selection.selection().edges) {
			if (edge.source === id && edge.sourcePort !== undefined) {
				ports.add(edge.sourcePort);
			}

			if (edge.target === id && edge.targetPort !== undefined) {
				ports.add(edge.targetPort);
			}
		}

		return ports;
	});

	isEndpointHighlighted(portId: string): boolean {
		return this.selectedEndpointPortIds().has(portId);
	}

	previewValueFor(basePortId: string): unknown {
		return this.previewValues.valueFor(this.node().id, basePortId);
	}

	onPortInlineChange(basePortId: string, value: unknown): void {
		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: this.node().id as NodeId,
			inputs: {
				...this.node().data.inputs,
				[basePortId]: value,
			},
		});
	}

	startLabelEdit(): void {
		this.labelDraft.set(this.node().data.ui.label ?? '');
		this.editingLabel.set(true);
		afterNextRender(
			() => {
				const inputEl = document.querySelector(
					`[data-node-id="${this.node().id}"] .lf-node-label-input`,
				);

				if (inputEl instanceof HTMLInputElement) {
					inputEl.focus();
					inputEl.select();
				}
			},
			{ injector: this.injector },
		);
	}

	onLabelKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			this.commitLabelEdit();
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			this.cancelLabelEdit();
		}
	}

	/** Click-outside / blur cancels — only Enter commits. */
	onLabelBlur(): void {
		if (this.editingLabel()) {
			this.cancelLabelEdit();
		}
	}

	cancelLabelEdit(): void {
		this.editingLabel.set(false);
	}

	commitLabelEdit(): void {
		if (!this.editingLabel()) {
			return;
		}

		const next = this.labelDraft().trim();
		const previous = this.node().data.ui.label?.trim() ?? '';

		this.editingLabel.set(false);

		if (next === previous) {
			return;
		}

		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: this.node().id as NodeId,
			ui: { label: next },
		});
	}

	onSeHandlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const node = this.node();
		const startSize = node.size ?? this.contentMinSize.minFor(node.id);
		const minSize = this.contentMinSize.minFor(node.id);
		const startFlow = this.viewport.clientToFlowPosition({
			x: event.clientX,
			y: event.clientY,
		});
		const target = event.currentTarget;

		if (!(target instanceof HTMLElement)) {
			return;
		}

		target.setPointerCapture(event.pointerId);
		this.seResizeCleanup?.();

		const onMove = (moveEvent: PointerEvent): void => {
			const flow = this.viewport.clientToFlowPosition({
				x: moveEvent.clientX,
				y: moveEvent.clientY,
			});
			const next = sizeFromSeResizeDelta(
				startSize,
				startFlow,
				flow,
				minSize,
			);
			this.nodeService.resizeNode(node.id, next, undefined, true);
		};

		const onUp = (upEvent: PointerEvent): void => {
			this.seResizeCleanup?.();
			this.seResizeCleanup = undefined;

			if (target.hasPointerCapture(upEvent.pointerId)) {
				target.releasePointerCapture(upEvent.pointerId);
			}

			const flow = this.viewport.clientToFlowPosition({
				x: upEvent.clientX,
				y: upEvent.clientY,
			});
			const next = sizeFromSeResizeDelta(
				startSize,
				startFlow,
				flow,
				minSize,
			);
			this.nodeService.resizeNode(node.id, next, undefined, true);
			this.bridge.raw['editor.updateNode.requested'].next({
				nodeId: node.id as NodeId,
				ui: { width: next.width, height: next.height },
			});
		};

		document.addEventListener('pointermove', onMove);
		document.addEventListener('pointerup', onUp);
		document.addEventListener('pointercancel', onUp);
		this.seResizeCleanup = () => {
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onUp);
			document.removeEventListener('pointercancel', onUp);
		};
	}

	private scheduleMinSizePublish(): void {
		if (this.minSizePublishScheduled) {
			return;
		}

		this.minSizePublishScheduled = true;
		afterNextRender(
			() => {
				requestAnimationFrame(() => {
					this.minSizePublishScheduled = false;
					this.publishContentMinSize();
				});
			},
			{ injector: this.injector },
		);
	}

	private publishContentMinSize(): void {
		const measured = this.measureContentMinSize();
		this.contentMinSize.set(this.node().id, measured);
		this.clampHeightToContentMin(measured.height);
	}

	private measureContentMinSize(): {
		readonly width: number;
		readonly height: number;
	} {
		const contentEl = this.content()?.nativeElement;

		if (contentEl === undefined) {
			return { width: MIN_NODE_WIDTH_PX, height: MIN_NODE_HEIGHT_PX };
		}

		return {
			width: MIN_NODE_WIDTH_PX,
			height: measureNodeContentMinHeightPx(
				contentEl,
				CHROME_PAD_Y_PX,
				MIN_NODE_HEIGHT_PX,
			),
		};
	}

	/** Mode B: if the node is already below the floor, bump it back up. */
	private clampHeightToContentMin(minHeight: number): void {
		const width = this.node().data.ui.position.width;

		if (width === undefined) {
			return;
		}

		const currentHeight = this.node().size?.height;

		if (
			currentHeight === undefined ||
			currentHeight + HEIGHT_EPSILON_PX >= minHeight
		) {
			return;
		}

		this.nodeService.resizeNode(
			this.node().id,
			{ width, height: minHeight },
			undefined,
			true,
		);
		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: this.node().id as NodeId,
			ui: { height: minHeight },
		});
	}

	private scheduleHeightSync(): void {
		if (this.heightSyncScheduled) {
			return;
		}

		this.heightSyncScheduled = true;
		afterNextRender(
			() => {
				requestAnimationFrame(() => {
					this.heightSyncScheduled = false;
					this.syncHeightToContent();
				});
			},
			{ injector: this.injector },
		);
	}

	private syncHeightToContent(): void {
		const width = this.node().data.ui.position.width;

		if (width === undefined) {
			return;
		}

		const { height } = this.measureContentMinSize();
		this.contentMinSize.set(this.node().id, {
			width: MIN_NODE_WIDTH_PX,
			height,
		});

		const currentHeight = this.node().size?.height;

		if (
			currentHeight !== undefined &&
			Math.abs(currentHeight - height) < HEIGHT_EPSILON_PX
		) {
			return;
		}

		this.nodeService.resizeNode(
			this.node().id,
			{ width, height },
			undefined,
			true,
		);
		this.bridge.raw['editor.updateNode.requested'].next({
			nodeId: this.node().id as NodeId,
			ui: { height },
		});
	}
}
