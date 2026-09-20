import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
} from '@angular/core';
import type { InlineConfig } from '@langflower/node-sdk';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import { LfInlineFieldComponent } from '../../../components/lf-inline-field.component';
import { LfNodePortRowStaticComponent } from '../../../components/lf-node-port-row-static.component.js';
import type {
	DiagramInputPortRow,
	DiagramOutputPortRow,
} from '../../../diagram/resolve-diagram-node-ports.js';
import {
	isEditableInline,
	resolveNodePorts,
} from '../../../diagram/resolve-diagram-node-ports.js';

type PreviewBodyRow = {
	readonly input: DiagramInputPortRow | null;
	readonly output: DiagramOutputPortRow | null;
	readonly inline: InlineConfig | null;
	readonly inlineValue: unknown;
	readonly showMultiBadge: boolean;
	readonly isBypassStub: boolean;
};

const paletteCardInline = (
	inline: InlineConfig | null | undefined,
): InlineConfig | null =>
	inline !== undefined && inline !== null && isEditableInline(inline)
		? inline
		: null;

const inputHasMulti = (
	node: PaletteNodeDefinition,
	basePortId: string,
): boolean =>
	node.inputsConfigs.some(
		(entry) =>
			String(entry.portId ?? entry.name ?? '') === basePortId &&
			entry.multi !== undefined,
	);

const buildPreviewRows = (node: PaletteNodeDefinition): PreviewBodyRow[] => {
	const ports = resolveNodePorts(node, 'palette-node-preview', []);
	const inputs = ports.inputPorts.filter((port) => port.slotIndex === 0);
	const outputs = ports.outputPorts;
	const pairedCount = Math.max(inputs.length, outputs.length);
	const rows: PreviewBodyRow[] = [];

	for (let index = 0; index < pairedCount; index += 1) {
		const inputPort = inputs[index];
		const outputPort = outputs[index];

		rows.push({
			input:
				inputPort !== undefined && !inputPort.hidden ? inputPort : null,
			output: outputPort ?? null,
			inline: paletteCardInline(inputPort?.inline),
			inlineValue: inputPort?.value,
			showMultiBadge:
				inputPort !== undefined &&
				inputHasMulti(node, inputPort.basePortId),
			isBypassStub: false,
		});
	}

	if (rows.length === 0 && ports.bypassPorts.length > 0) {
		rows.push({
			input: null,
			output: null,
			inline: null,
			inlineValue: undefined,
			showMultiBadge: false,
			isBypassStub: true,
		});
	}

	return rows;
};

@Component({
	selector: 'lf-palette-node-preview',
	standalone: true,
	imports: [LfInlineFieldComponent, LfNodePortRowStaticComponent],
	template: `
		<div
			class="relative min-w-48 px-5 [--lf-node-chrome-padding-x:1.25rem]"
		>
			<p
				class="mb-2 truncate text-center text-xs font-semibold text-zinc-900 dark:text-zinc-100"
			>
				{{ node().displayName }}
			</p>

			@for (row of bodyRows(); track $index) {
				<div class="py-1">
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1">
							@if (row.input !== null) {
								<lf-node-port-row-static
									side="in"
									[label]="row.input.label"
									[wireType]="row.input.wireType"
								/>
							}
						</div>

						@if (row.isBypassStub) {
							<p
								class="min-w-0 flex-1 text-center text-[10px] text-zinc-500 dark:text-zinc-400"
							>
								Dynamic channels
							</p>
						}

						<div class="min-w-0 flex-1">
							@if (row.output !== null) {
								<lf-node-port-row-static
									side="out"
									[label]="row.output.label"
									[wireType]="row.output.wireType"
								/>
							}
						</div>
					</div>

					@if (row.inline !== null) {
						<div class="mt-1">
							<lf-inline-field
								[config]="row.inline"
								[value]="row.inlineValue"
								[disabled]="true"
							/>
						</div>
					}
					@if (row.showMultiBadge) {
						<span
							class="mt-1 block text-[10px] text-zinc-400 dark:text-zinc-500"
						>
							multi
						</span>
					}
				</div>
			}
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaletteNodePreviewComponent {
	readonly node = input.required<PaletteNodeDefinition>();

	readonly bodyRows = computed(() => buildPreviewRows(this.node()));
}

/** Test hook for row layout without Angular TestBed. */
export const buildPreviewRowsForTest = (
	node: PaletteNodeDefinition,
): PreviewBodyRow[] => buildPreviewRows(node);
