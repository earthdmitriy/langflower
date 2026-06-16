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

export type ToolPermissionTableRow = {
	readonly toolId: string;
	readonly title: string;
	readonly decision: ToolPermissionDecision;
	readonly options: readonly ToolPermissionDecision[];
};

const ALL_DECISIONS: readonly ToolPermissionDecision[] = [
	'deny',
	'ask',
	'allow',
];

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
						</td>
						@for (decision of allDecisions; track decision) {
							<td class="px-1 py-1 text-center">
								@if (row.options.includes(decision)) {
									<input
										type="radio"
										class="align-middle"
										[name]="'tool-perm-' + row.toolId"
										[checked]="row.decision === decision"
										[disabled]="disabled()"
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

	onPick(toolId: string, decision: ToolPermissionDecision): void {
		this.decisionChange.emit({ toolId, decision });
	}
}
