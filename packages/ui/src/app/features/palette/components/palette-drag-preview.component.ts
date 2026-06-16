import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
} from '@angular/core';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { resolveNodePorts } from '../../../diagram/resolve-diagram-node-ports.js';
import { LfNodePortRowStaticComponent } from '../../canvas/components/lf-node-port-row-static.component.js';

@Component({
	selector: 'lf-palette-drag-preview',
	standalone: true,
	imports: [LfNodePortRowStaticComponent],
	host: {
		class: 'inline-block w-max',
	},
	template: `
		<div
			class="lf-node-chrome flex h-full min-h-12 min-w-40 flex-col rounded-xl border border-zinc-300 bg-white py-3 dark:border-zinc-700 dark:bg-zinc-900"
		>
			<span
				class="truncate px-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100"
			>
				{{ node().displayName }}
			</span>

			@for (row of inputPortRows(); track row.portId) {
				<lf-node-port-row-static
					side="in"
					[label]="row.label"
					[wireType]="row.wireType"
				/>
			}

			@for (row of outputPortRows(); track row.portId) {
				<lf-node-port-row-static
					side="out"
					[label]="row.label"
					[wireType]="row.wireType"
				/>
			}
		</div>
	`,
	styleUrl: './../../canvas/styles/node-port-layout.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteDragPreviewComponent {
	readonly node = input.required<PaletteNodeDefinition>();

	readonly ports = computed(() =>
		resolveNodePorts(this.node(), 'palette-drag-preview', []),
	);

	readonly inputPortRows = computed(() => this.ports().inputPorts);
	readonly outputPortRows = computed(() => this.ports().outputPorts);
}
