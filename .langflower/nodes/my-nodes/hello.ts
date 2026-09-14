import { defineToolRegistrations } from '@langflower/node-sdk';

/**
 * LLM tool pack — wire the `tools` output into an agent / LLM `tools` port.
 * The model calls `hello` on demand; it returns the literal text `hello world`.
 */
export default defineToolRegistrations({
	type: 'my-hello-tool',
	displayName: 'Hello Tool',
	category: 'Text',
	description:
		'Emits a `hello` ToolHandle for agent inventory — returns `hello world` as text.',
	tools: [
		{
			toolId: 'hello',
			name: 'hello',
			description: 'Returns the literal text `hello world` to the agent.',
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
			handler: async () => 'hello world',
		},
	],
});
