import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
} from '@langflower/node-sdk';
import {
	createMemoryStore,
	MEMORY_PLAN_FILE,
	MEMORY_PLAN_HEADING,
} from '@langflower/tools/create-memory-store';
import { MEMORY_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';
import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { of } from 'rxjs';

/**
 * Emits Memory ToolHandles for `.langflower/memory/` markdown tools, plus a
 * `plan` output that prints the current plan in the work log after
 * `update_plan`. Invokers come from `@langflower/tools`.
 */
export const memoryToolsNode = defineReactiveNode({
	type: 'common-memory-tools',
	displayName: 'Memory Tools',
	category: 'Tools',
	description: `
Give an agent tools to read and write the project wiki (tree, search, append, update, create) and to show the current plan in the work log.

Wire **tools** into an LLM. Notes live under the project's memory folder. Call **update_plan** to print the live plan — there is no separate Plan mode.
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { configureOutput }) {
		const planOut = statefulConnection<string>();

		const tools$ = statefulObservable({
			loader: () =>
				of(
					MEMORY_TOOL_CONFIGS.map((tool): ToolHandle => {
						const handle: ToolHandle = {
							toolId: tool.toolId,
							name: tool.name ?? tool.toolId,
							description: tool.description,
							inputSchema: tool.inputSchema,
							invoke: tool.handler,
						};

						if (tool.toolId !== 'update_plan') {
							return handle;
						}

						return {
							...handle,
							invoke: async (args, ctx) => {
								const result = await tool.handler(args, ctx);
								try {
									const markdown = await createMemoryStore(
										ctx.projectDir,
									).readSection(
										MEMORY_PLAN_FILE,
										MEMORY_PLAN_HEADING,
									);
									planOut.connect(of(markdown));
								} catch {
									// Keep the tool result; skip feed emit.
								}
								return result;
							},
						};
					}),
				),
		});

		return {
			inputs: [],
			outputs: [
				configureOutput('tools', tools$, {
					wireType: TOOL_HANDLE_WIRE_TYPE,
				}),
				configureOutput('plan', planOut, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
			],
		};
	},
});
