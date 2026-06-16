import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import {
	NgDiagramBaseEdgeComponent,
	NgDiagramModelService,
	type Edge,
	type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { resolveNodeBounds } from '../utils/build-below-route-points';
import { hasReverseEdgeBetween, isBackEdge } from '../utils/is-back-edge';
import { valuePulseActive$ } from '../utils/value-pulse-active.js';

/** Dash pattern when a back-edge cannot be routed below nodes. */
export const BACK_EDGE_DASHARRAY = '6 4';

/**
 * Self-contained wire chrome. Renders the default edge (`ng-diagram-base-edge`)
 * and projects the shared execution state onto itself: steady-state colour
 * from the reduced `wireStatus` signal, plus a transient green pulse on a
 * delivered value. Because the component reads the signal on its own first
 * render, a mid-run reload shows the correct chrome as soon as ng-diagram
 * paints the edge — no canvas-wide DOM query, no timing race.
 *
 * Back-edge geometry (U-route below nodes) lives in
 * `createBackEdgeAwareOrthogonalRouting` — **not** here. Do not set
 * `routingMode: 'manual'` on the edge passed to base-edge: it syncs into the
 * model and freezes the path after drag.
 */
@Component({
	selector: 'lf-edge',
	standalone: true,
	imports: [NgDiagramBaseEdgeComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[class.lf-edge--inactive]': 'status() === "inactive"',
		'[class.lf-edge--pending]': 'status() === "pending"',
		'[class.lf-edge--value]': 'status() === "value"',
		'[class.lf-edge--error]': 'status() === "error"',
		'[class.lf-edge--pulse]': 'pulse()',
		'[class.lf-edge--selected]': 'selected()',
		'[class.lf-edge--back]': 'isBack()',
	},
	styles: `
		/*
		 * Hover must set --edge-stroke on this host. ng-diagram's
		 * .default-edge:hover rules live in DefaultEdgeComponent encapsulation
		 * and never match a custom lf-edge → base-edge tree, so only an
		 * inherited --edge-stroke reaches the path's
		 * stroke="var(--edge-stroke, var(--ngd-default-edge-stroke))".
		 */
		:host {
			pointer-events: all;
			--edge-stroke-transition: stroke 0.1s ease-in-out;
		}
		:host:hover:not(.lf-edge--selected) {
			--edge-stroke: rgb(74 108 182);
		}
		:host-context([data-theme='dark']):host:hover:not(.lf-edge--selected) {
			--edge-stroke: rgb(120 160 220);
		}
		:host.lf-edge--selected {
			--ngd-default-edge-stroke: rgb(37 99 235);
			--ngd-default-edge-stroke-selected: rgb(37 99 235);
			--edge-stroke: rgb(37 99 235);
			--ngd-default-edge-width: 2.5px;
		}
		:host-context([data-theme='dark']):host.lf-edge--selected {
			--ngd-default-edge-stroke: rgb(96 165 250);
			--ngd-default-edge-stroke-selected: rgb(96 165 250);
			--edge-stroke: rgb(96 165 250);
		}
	`,
	template: `<ng-diagram-base-edge
		[edge]="edge()"
		[strokeDasharray]="dash()"
	/>`,
})
export class LfEdgeChromeComponent implements NgDiagramEdgeTemplate<object> {
	readonly edge = input.required<Edge<object>>();

	private readonly execution = inject(WorkflowExecutionService);
	private readonly diagramModel = inject(NgDiagramModelService);

	/** Steady-state wire chrome, reduced from the shared service signal. */
	readonly status = computed(() => this.execution.wireStatus(this.edge().id));

	readonly selected = computed(() => this.edge().selected === true);

	private readonly backEdgeInput = computed(() => {
		const edge = this.edge();
		const nodes = this.diagramModel.nodes();
		const sourceNode =
			nodes.find((node) => node.id === edge.source) ?? null;
		const targetNode =
			nodes.find((node) => node.id === edge.target) ?? null;
		return {
			sourceBounds: resolveNodeBounds(sourceNode),
			targetBounds: resolveNodeBounds(targetNode),
			sourcePort: edge.sourcePosition,
			targetPort: edge.targetPosition,
			hasReverseEdge: hasReverseEdgeBetween(
				this.diagramModel.edges(),
				edge.source,
				edge.target,
			),
		};
	});

	readonly isBack = computed(() => isBackEdge(this.backEdgeInput()));

	/**
	 * Dashed when back-edge but node boxes are not yet known (routing falls
	 * back to built-in orthogonal until sizes exist).
	 */
	readonly dash = computed((): string | undefined => {
		const input = this.backEdgeInput();
		if (!isBackEdge(input)) {
			return undefined;
		}
		if (input.sourceBounds !== null && input.targetBounds !== null) {
			return undefined;
		}
		return BACK_EDGE_DASHARRAY;
	});

	/**
	 * Transient green flash on a delivered value — `valuePulseActive$` over
	 * this edge's live `output-emitted` slice (not the reduced steady-state).
	 */
	readonly pulse = toSignal(
		toObservable(this.edge).pipe(
			map((edge) => edge.id),
			switchMap((edgeId) =>
				valuePulseActive$(this.execution.getEventsForEdge(edgeId)),
			),
		),
		{ initialValue: false },
	);
}
