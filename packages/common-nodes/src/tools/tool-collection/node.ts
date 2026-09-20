import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
} from '@langflower/node-sdk';
import { map } from 'rxjs';
import { lastWinsToolHandles } from '../collect-agent-tool-handles.js';

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
			map((wired) => lastWinsToolHandles(wired)),
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
