import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
} from '@angular/core';
import type {
	ToolPermissionDecision,
	ToolPermissionsMap,
} from '@langflower/common-nodes/ai/llm-role-preset';
import {
	clampToolPermissionForUi,
	isHarnessToolAlwaysDenied,
	toolFloorDecisionForUi,
	validNodePermissionOptionsForUi,
	type ProjectPermissionConfig,
} from '@langflower/common-nodes/ai/llm-role-preset';
import type { InlineSelectOption } from '@langflower/node-sdk';
import { LfHoverTipComponent } from '../../../components/lf-hover-tip.component';

export type ToolPermissionTableRow = {
	readonly toolId: string;
	readonly title: string;
	/** What the agent is told this tool does; absent when none is known. */
	readonly description?: string;
	readonly decision: ToolPermissionDecision;
	readonly options: readonly ToolPermissionDecision[];
};

const ALL_DECISIONS: readonly ToolPermissionDecision[] = [
	'deny',
	'ask',
	'allow',
];

const DECISION_ACCENT: Readonly<Record<ToolPermissionDecision, string>> = {
	deny: 'accent-rose-600',
	ask: 'accent-amber-500',
	allow: 'accent-emerald-600',
};

export const buildToolPermissionTableRows = (
	toolOptions: readonly InlineSelectOption[],
	toolPermissions: ToolPermissionsMap,
	projectPermission: ProjectPermissionConfig | undefined,
): readonly ToolPermissionTableRow[] => {
	const rows: ToolPermissionTableRow[] = [];

	for (const option of toolOptions) {
		const toolId = String(option.value);

		if (isHarnessToolAlwaysDenied(projectPermission, toolId)) {
			continue;
		}

		const floor = toolFloorDecisionForUi(projectPermission, toolId);
		const options = validNodePermissionOptionsForUi(floor);

		if (options.length === 0) {
			continue;
		}

		const raw = toolPermissions[toolId] ?? 'allow';
		const decision = clampToolPermissionForUi(floor, raw);

		rows.push({
			toolId,
			title: option.title ?? toolId,
			...(option.description !== undefined &&
			option.description.trim().length > 0
				? { description: option.description }
				: {}),
			decision,
			options,
		});
	}

	return rows;
};

@Component({
	selector: 'lf-tool-permission-table',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [LfHoverTipComponent],
	template: `
		<table class="w-full border-collapse text-[10px]">
			<thead>
				<tr class="text-left text-zinc-500 dark:text-zinc-400">
					<th class="py-1 pr-2 font-medium">tool</th>
					<th class="px-1 py-1 text-center font-medium">deny</th>
					<th class="px-1 py-1 text-center font-medium">ask</th>
					<th class="px-1 py-1 text-center font-medium">allow</th>
				</tr>
			</thead>
			<tbody>
				@for (row of rows(); track row.toolId) {
					<tr class="border-t border-zinc-200 dark:border-zinc-700">
						<td
							class="py-1 pr-2 text-zinc-700 dark:text-zinc-200"
							[title]="row.toolId"
						>
							{{ row.title }}
							@if (row.description; as description) {
								<lf-hover-tip
									class="ml-1 align-middle"
									side="left"
									align="center"
									tipTitle="Tool description for agent"
									[tip]="description"
								>
									<button
										type="button"
										class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-400 text-[9px] font-semibold leading-none text-zinc-500 hover:border-zinc-600 hover:text-zinc-700 dark:border-zinc-500 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-200"
										[attr.aria-label]="
											row.title + ' tool description'
										"
									>
										?
									</button>
								</lf-hover-tip>
							}
						</td>
						@for (decision of allDecisions; track decision) {
							<td class="px-1 py-1 text-center">
								@if (row.options.includes(decision)) {
									<input
										type="radio"
										class="align-middle"
										[class]="decisionAccent[decision]"
										[class.pointer-events-none]="disabled()"
										[attr.tabindex]="disabled() ? -1 : null"
										[name]="'tool-perm-' + row.toolId"
										[checked]="row.decision === decision"
										[attr.aria-disabled]="disabled()"
										[attr.aria-label]="
											row.title + ': ' + decision
										"
										(change)="onPick(row.toolId, decision)"
									/>
								}
							</td>
						}
					</tr>
				}
			</tbody>
		</table>
	`,
})
export class LfToolPermissionTableComponent {
	readonly rows = input.required<readonly ToolPermissionTableRow[]>();
	readonly disabled = input(false);
	readonly decisionChange = output<{
		readonly toolId: string;
		readonly decision: ToolPermissionDecision;
	}>();

	readonly allDecisions = ALL_DECISIONS;
	readonly decisionAccent = DECISION_ACCENT;

	/**
	 * Locked (e.g. during a run) the radios stay enabled but unreachable by
	 * pointer and Tab: a native `disabled` radio paints its checked dot in
	 * washed-out grey, hiding the state the operator needs to read.
	 */
	onPick(toolId: string, decision: ToolPermissionDecision): void {
		if (this.disabled()) {
			return;
		}

		this.decisionChange.emit({ toolId, decision });
	}
}
