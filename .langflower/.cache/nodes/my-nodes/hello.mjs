// hello.ts
import { defineToolRegistrations } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
var hello_default = defineToolRegistrations({
	type: 'my-hello-tool',
	displayName: 'Hello Tool',
	category: 'Text',
	description:
		'Emits a `hello` ToolHandle for agent inventory \u2014 returns `hello world` as text.',
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
export { hello_default as default };
