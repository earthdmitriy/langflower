import {
	ChangeDetectionStrategy,
	Component,
	inject,
	input,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NgDiagramPortComponent } from 'ng-diagram';
import { combineLatest, switchMap } from 'rxjs';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { valuePulseActive$ } from '../utils/value-pulse-active.js';

@Component({
	selector: 'lf-node-bypass-port-row',
	standalone: true,
	host: {
		class: 'lf-port-row-host',
	},
	imports: [NgDiagramPortComponent],
	template: `
		<div
			class="lf-port-row lf-port-row--bypass"
			[class.lf-port-row--node-selected]="nodeSelected()"
		>
			<div
				class="lf-port-anchor lf-port-anchor--in"
				[class.lf-port-anchor--endpoint]="inputEndpointHighlighted()"
				[class.lf-port-anchor--node-selected]="nodeSelected()"
				[class.lf-port-anchor--pulse]="inputPulse()"
			>
				<ng-diagram-port
					[id]="inputPortId()"
					type="target"
					side="left"
					originPoint="centerLeft"
				/>
			</div>

			<div class="lf-port-row__content">
				<span>{{ label() }}</span>
				<span class="text-zinc-400 dark:text-zinc-500">
					· {{ wireType() }}
				</span>
			</div>

			<div
				class="lf-port-anchor lf-port-anchor--out"
				[class.lf-port-anchor--endpoint]="outputEndpointHighlighted()"
				[class.lf-port-anchor--node-selected]="nodeSelected()"
				[class.lf-port-anchor--pulse]="outputPulse()"
			>
				<ng-diagram-port
					[id]="outputPortId()"
					type="source"
					side="right"
				/>
			</div>
		</div>
	`,
	styleUrl: './../styles/node-port-layout.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfNodeBypassPortRowComponent {
	private readonly execution = inject(WorkflowExecutionService);

	readonly nodeId = input.required<string>();
	/** Bare runtime bypass handle (`ch`, `ch@1`, …). */
	readonly runtimePortId = input.required<string>();
	readonly inputPortId = input.required<string>();
	readonly outputPortId = input.required<string>();
	readonly label = input.required<string>();
	readonly wireType = input.required<string>();
	readonly nodeSelected = input<boolean>(false);
	readonly inputEndpointHighlighted = input<boolean>(false);
	readonly outputEndpointHighlighted = input<boolean>(false);

	readonly inputPulse = toSignal(
		combineLatest([
			toObservable(this.nodeId),
			toObservable(this.runtimePortId),
		]).pipe(
			switchMap(([nodeId, runtimePortId]) =>
				valuePulseActive$(
					this.execution.getInputEventsForPort(nodeId, runtimePortId),
				),
			),
		),
		{ initialValue: false },
	);

	readonly outputPulse = toSignal(
		combineLatest([
			toObservable(this.nodeId),
			toObservable(this.runtimePortId),
		]).pipe(
			switchMap(([nodeId, runtimePortId]) =>
				valuePulseActive$(
					this.execution.getEventsForPort(nodeId, runtimePortId),
				),
			),
		),
		{ initialValue: false },
	);
}
