import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
} from '@langflower/node-sdk';
import { formatToolInspectText } from './format-tool-inspect-text.js';

/**
 * Preview-like dump of a `tool-handle` wire: toolId, example args JSON,
 * and the full `inputSchema`. Optional `toolId` input filters the pack.
 * `invoke` is not serialized. Wire `text` onward or read it in the work log.
 */
export const toolInspectNode = defineReactiveNode({
	type: 'common-tool-inspect',
	displayName: 'Tool inspect',
	category: 'Output',
	description: `
Show wired tools as copy-paste **toolId**, example **args**, and input schema.
Optional **toolId** filter shrinks the dump to matching tools.

Typical uses:
- Read MCP / pack inventory before Tool invoke
- Confirm which tool ids a wire actually carries
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const tools = makeInput<unknown>('tools', {
			name: 'tools',
			wireType: TOOL_HANDLE_WIRE_TYPE,
			defaultValue: [],
		});
		const toolId = makeInput<string>('toolId', {
			name: 'toolId',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
		});

		const text$ = combineInputs([tools, toolId], ([wired, rawId]) =>
			formatToolInspectText(wired, rawId),
		);

		return {
			inputs: [tools, toolId],
			outputs: [
				configureOutput('text', text$, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
			],
		};
	},
});
