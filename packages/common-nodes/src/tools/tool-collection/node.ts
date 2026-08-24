import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
} from '@langflower/node-sdk';
import { map } from 'rxjs';
import { flattenToolHandles } from '../collect-agent-tool-handles.js';

const mergeToolHandlesLastWins = (wired: unknown): readonly ToolHandle[] => {
	const flattened = Array.isArray(wired)
		? flattenToolHandles(wired)
		: flattenToolHandles(
				wired === undefined || wired === null ? [] : [wired],
			);
	const byId = new Map<string, ToolHandle>();
	for (const handle of flattened) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};

/**
 * Optional hub: combine many `tools` wires into one `ToolHandle[]`.
 * Duplicate `toolId` last-wins (later slot). Empty / unwired → `[]`.
 */
export const toolCollectionNode = defineReactiveNode({
	type: 'common-tool-collection',
	displayName: 'Tool collection',
	category: 'Tools',
	description: `
Combine several tool wires into one before an agent. Duplicate names: the last wire wins.

Optional — you can still plug many tool packs straight into the agent.
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const tools = makeInput<readonly unknown[]>('tools', {
			name: 'tools',
			wireType: TOOL_HANDLE_WIRE_TYPE,
			multi: 'combine',
			defaultValue: [],
		});

		const merged$ = tools.pipeValue(
			map((wired) => mergeToolHandlesLastWins(wired)),
		);

		return {
			inputs: [tools],
			outputs: [
				configureOutput('tools', merged$, {
					wireType: TOOL_HANDLE_WIRE_TYPE,
				}),
			],
		};
	},
});
