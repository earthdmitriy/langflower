import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
	type InlineConfig,
	resolveMultilineInlineLayout,
} from '@langflower/node-sdk';
import { NgDiagramPortComponent } from 'ng-diagram';
import { combineLatest, switchMap } from 'rxjs';
import { WorkflowExecutionService } from '../../../services/workflow-execution.service';
import { valuePulseActive$ } from '../utils/value-pulse-active.js';
import { LfInlineFieldComponent } from './lf-inline-field.component';

const PREVIEW_PANE_FLOOR_PX = 16;

const isPreviewInline = (config: InlineConfig | null): boolean => {
	if (config === null) {
		return false;
	}

	const kind = typeof config === 'string' ? config : config.type;
	return (
		kind === 'preview' ||
		kind === 'preview-markdown' ||
		kind === 'preview-code'
	);
};

@Component({
	selector: 'lf-node-port-row',
	standalone: true,
	host: {
		class: 'lf-port-row-host',
		'[class.lf-port-row-host--grow]': 'growFlex() > 0',
		'[class.lf-port-row-host--preview]': 'previewInline()',
		'[style.--lf-inline-flex]': 'growFlex()',
		'[style.--lf-multiline-min.px]': 'multilineMinHeightPx()',
	},
	imports: [NgDiagramPortComponent, LfInlineFieldComponent],
	template: `
		<div
			class="lf-port-row-wrapper"
			[class.lf-port-row-wrapper--node-selected]="nodeSelected()"
		>
			<div
				class="lf-port-row"
				[class.lf-port-row--in]="side() === 'in'"
				[class.lf-port-row--out]="side() === 'out'"
			>
				@if (side() === 'in' && !hidden()) {
					<div
						class="lf-port-anchor lf-port-anchor--in"
						[class.lf-port-anchor--endpoint]="endpointHighlighted()"
						[class.lf-port-anchor--node-selected]="nodeSelected()"
						[class.lf-port-anchor--pulse]="pulse()"
					>
						<ng-diagram-port
							[id]="portId()"
							type="target"
							side="left"
							originPoint="centerLeft"
						/>
					</div>
				}

				<div class="lf-port-row__content">
					<span>{{ label() }}</span>
					<span class="text-zinc-400 dark:text-zinc-500">
						· {{ wireType() }}
					</span>
				</div>

				@if (side() === 'out') {
					<div
						class="lf-port-anchor lf-port-anchor--out"
						[class.lf-port-anchor--endpoint]="endpointHighlighted()"
						[class.lf-port-anchor--node-selected]="nodeSelected()"
						[class.lf-port-anchor--pulse]="pulse()"
					>
						<ng-diagram-port
							[id]="portId()"
							type="source"
							side="right"
						/>
					</div>
				}
			</div>

			@if (side() === 'in' && inline() !== null) {
				<div class="lf-port-row__inline">
					<lf-inline-field
						[config]="inline()!"
						[value]="value()"
						[previewValue]="previewValue()"
						[disabled]="disabled()"
						[fill]="growFlex() > 0"
						(valueChange)="valueChange.emit($event)"
					/>
				</div>
			}
		</div>
	`,
	styleUrl: './../styles/node-port-layout.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LfNodePortRowComponent {
	private readonly execution = inject(WorkflowExecutionService);

	readonly side = input.required<'in' | 'out'>();
	readonly nodeId = input.required<string>();
	readonly portId = input.required<string>();
	/** Bare runtime port id (no `in:` / `out:` diagram prefix). */
	readonly runtimePortId = input.required<string>();
	readonly label = input.required<string>();
	readonly wireType = input.required<string>();
	readonly inline = input<InlineConfig | null>(null);
	readonly value = input<unknown>(undefined);
	readonly previewValue = input<unknown>(undefined);
	readonly disabled = input<boolean>(false);
	readonly hidden = input<boolean>(false);
	readonly nodeSelected = input<boolean>(false);
	readonly endpointHighlighted = input<boolean>(false);

	readonly valueChange = output<unknown>();

	readonly pulse = toSignal(
		combineLatest([
			toObservable(this.nodeId),
			toObservable(this.runtimePortId),
			toObservable(this.side),
		]).pipe(
			switchMap(([nodeId, runtimePortId, side]) =>
				side === 'out'
					? valuePulseActive$(
							this.execution.getEventsForPort(
								nodeId,
								runtimePortId,
							),
						)
					: valuePulseActive$(
							this.execution.getInputEventsForPort(
								nodeId,
								runtimePortId,
							),
						),
			),
		),
		{ initialValue: false },
	);

	readonly multilineLayout = computed(() => {
		const config = this.inline();
		return config === null ? null : resolveMultilineInlineLayout(config);
	});

	readonly previewInline = computed(() => isPreviewInline(this.inline()));

	readonly growFlex = computed(() => {
		const multiline = this.multilineLayout()?.flex ?? 0;
		if (multiline > 0) {
			return multiline;
		}

		return this.previewInline() ? 1 : 0;
	});

	readonly multilineMinHeightPx = computed(() => {
		if (this.previewInline()) {
			return PREVIEW_PANE_FLOOR_PX;
		}

		return this.multilineLayout()?.minHeightPx;
	});
}
