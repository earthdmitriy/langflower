import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
} from '@angular/core';
import type {
	InlineConfig,
	InputPortMeta,
	OutputPortMeta,
} from '@langflower/node-sdk';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { LfInlineFieldComponent } from '../../canvas/components/lf-inline-field.component';

type PreviewPortDot = {
	readonly portId: string;
	readonly label: string;
	readonly wireType: string;
	readonly ariaLabel: string;
};

type PreviewBodyRow = {
	readonly leftDot: PreviewPortDot | null;
	readonly rightDot: PreviewPortDot | null;
	readonly inline: InlineConfig | null;
	readonly inlineValue: unknown;
	readonly showMultiBadge: boolean;
	readonly isBypassStub: boolean;
};

function isHidden(value: { readonly hidden?: boolean } | undefined): boolean {
	return value?.hidden === true;
}

function inputWireType(config: InputPortMeta<unknown>): string {
	if (config.dynamic === true) {
		return 'dynamic';
	}

	return String(config.wireType ?? 'any');
}

function toInputDot(input: InputPortMeta<unknown>): PreviewPortDot {
	const portId = input.name ?? String(input.portId ?? 'unknown');
	const label = input.name ?? portId;
	const wireType = inputWireType(input);

	return {
		portId,
		label,
		wireType,
		ariaLabel: `${label}, ${wireType} input`,
	};
}

function toOutputDot(output: OutputPortMeta): PreviewPortDot {
	const portId = String(output.portId);
	const name = 'name' in output ? output.name : undefined;
	const label = String(name ?? portId);
	const wireType =
		output.fromInput !== undefined
			? `from(${output.fromInput})`
			: String(output.wireType);

	return {
		portId,
		label,
		wireType,
		ariaLabel: `${label}, ${wireType} output`,
	};
}

/**
 * Preview/live-value kinds have nothing to show in the static palette card
 * (no execution running) — only editable kinds render an inline stub there.
 */
function editableInline(config: InlineConfig | undefined): InlineConfig | null {
	if (config === undefined) {
		return null;
	}

	return typeof config === 'string' && config.startsWith('preview')
		? null
		: config;
}

function visibleInputs(
	node: PaletteNodeDefinition,
): readonly InputPortMeta<unknown>[] {
	return node.inputsConfigs.filter(
		(entry) => !isHidden(entry) || editableInline(entry.inline) !== null,
	);
}

function visibleOutputs(
	node: PaletteNodeDefinition,
): readonly OutputPortMeta[] {
	return node.outputsConfigs.filter(
		(entry) => entry !== undefined && !isHidden(entry),
	);
}

function buildPreviewRows(node: PaletteNodeDefinition): PreviewBodyRow[] {
	const inputs = visibleInputs(node);
	const outputs = visibleOutputs(node);
	const rows: PreviewBodyRow[] = [];
	const pairedCount = Math.max(inputs.length, outputs.length);

	for (let index = 0; index < pairedCount; index += 1) {
		const inputConfig = inputs[index];
		const outputConfig = outputs[index];

		rows.push({
			leftDot:
				inputConfig !== undefined && !isHidden(inputConfig)
					? toInputDot(inputConfig)
					: null,
			rightDot:
				outputConfig !== undefined ? toOutputDot(outputConfig) : null,
			inline: editableInline(inputConfig?.inline),
			inlineValue: inputConfig?.defaultValue,
			showMultiBadge: inputConfig?.multi !== undefined,
			isBypassStub: false,
		});
	}

	if (
		rows.length === 0 &&
		Object.keys(node.bypassPorts).length > 0 &&
		inputs.length === 0 &&
		outputs.length === 0
	) {
		rows.push({
			leftDot: null,
			rightDot: null,
			inline: null,
			inlineValue: undefined,
			showMultiBadge: false,
			isBypassStub: true,
		});
	}

	return rows;
}

@Component({
	selector: 'lf-palette-node-preview',
	standalone: true,
	imports: [LfInlineFieldComponent],
	template: `
		<div class="relative min-w-48">
			<p
				class="mb-2 truncate text-center text-xs font-semibold text-zinc-900 dark:text-zinc-100"
			>
				{{ node().displayName }}
			</p>

			@for (row of bodyRows(); track $index) {
				<div class="py-1">
					<div class="flex items-start gap-2">
						<div class="flex min-w-0 flex-1 items-start gap-1.5">
							@if (row.leftDot !== null) {
								<span
									class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
									[attr.aria-label]="row.leftDot.ariaLabel"
								></span>
								<span
									class="text-[10px] text-zinc-600 dark:text-zinc-300"
								>
									{{ row.leftDot.label }}
									<span
										class="text-zinc-400 dark:text-zinc-500"
									>
										· {{ row.leftDot.wireType }}
									</span>
								</span>
							}
						</div>

						@if (row.isBypassStub) {
							<p
								class="min-w-0 flex-1 text-center text-[10px] text-zinc-500 dark:text-zinc-400"
							>
								Dynamic channels
							</p>
						}

						<div
							class="flex min-w-0 flex-1 items-start justify-end gap-1.5"
						>
							@if (row.rightDot !== null) {
								<span
									class="text-right text-[10px] text-zinc-600 dark:text-zinc-300"
								>
									{{ row.rightDot.label }}
									<span
										class="text-zinc-400 dark:text-zinc-500"
									>
										· {{ row.rightDot.wireType }}
									</span>
								</span>
								<span
									class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-zinc-400 bg-white dark:border-zinc-500 dark:bg-zinc-900"
									[attr.aria-label]="row.rightDot.ariaLabel"
								></span>
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
export function buildPreviewRowsForTest(
	node: PaletteNodeDefinition,
): PreviewBodyRow[] {
	return buildPreviewRows(node);
}
