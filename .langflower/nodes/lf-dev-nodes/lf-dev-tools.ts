import { defineToolRegistrations } from '@langflower/node-sdk';
import {
	NPM_SCRIPT_TOOLS,
	runAllowlistedNpm,
	runTargetedTests,
} from './lib/run-npm-script.ts';

const EMPTY_ARGS_SCHEMA = {
	type: 'object',
	properties: {},
	additionalProperties: false,
} as const;

/**
 * LLM tool pack — wire `tools` into an agent / LLM `tools` port.
 * Curated Langflower root npm scripts plus a focused Vitest slice.
 *
 * Shell is not on the public ExecutionContext yet — uses `child_process`.
 * Prefer Caps / host APIs when they ship.
 */
export default defineToolRegistrations({
	type: 'lf-dev-tools',
	displayName: 'LF Dev Tools',
	category: 'Tools',
	description:
		'Emits npm script ToolHandles and `run_targeted_tests` for agent inventory. Results are stripped to pass/fail plus errors.',
	tools: [
		...NPM_SCRIPT_TOOLS.map((tool) => ({
			toolId: tool.toolId,
			name: tool.toolId,
			description: tool.description,
			inputSchema: EMPTY_ARGS_SCHEMA,
			handler: async (
				_args: Readonly<Record<string, unknown>>,
				ctx: { readonly projectDir: string },
			) => runAllowlistedNpm(tool.script, String(ctx.projectDir ?? '')),
		})),
		{
			toolId: 'run_targeted_tests',
			name: 'run_targeted_tests',
			description:
				'Runs `node build/test.mjs` on given project-relative paths. Optional `suite`: unit (default), integration, or all. Returns failed tests only. Do not overlap with a full `npm_test` in the same project.',
			inputSchema: {
				type: 'object',
				properties: {
					paths: {
						type: 'array',
						items: { type: 'string' },
						minItems: 1,
						description:
							'Test files or directories relative to the project root.',
					},
					suite: {
						type: 'string',
						enum: ['unit', 'integration', 'all'],
						description:
							'Vitest project. Default unit. Use integration for tests/integration/**.',
					},
				},
				required: ['paths'],
				additionalProperties: false,
			},
			handler: async (args, ctx) =>
				runTargetedTests(args, String(ctx.projectDir ?? '')),
		},
	],
});
