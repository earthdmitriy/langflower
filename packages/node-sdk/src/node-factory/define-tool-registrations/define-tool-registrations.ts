import { statefulObservable } from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { defineReactiveNode } from '../define-reactive-node/define-reactive-node.js';
import {
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
	type ToolHandler,
} from './tool-handle.js';

/**
 * Purpose utility atop {@link defineReactiveNode}: emit a `tools` pack as
 * {@link ToolHandle}[]. Config still takes domain `handler`s; factory maps
 * them to `invoke`.
 *
 * @example
 * ```ts
 * import { MEMORY_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';
 *
 * export const memoryToolsNode = defineToolRegistrations({
 *   type: 'common-memory-tools',
 *   displayName: 'Memory Tools',
 *   category: 'Memory',
 *   tools: MEMORY_TOOL_CONFIGS,
 * });
 * ```
 */
export const defineToolRegistrations = (config: {
	readonly type: string;
	readonly displayName: string;
	readonly category?: string;
	readonly description?: string;
	readonly icon?: string;
	readonly tools: readonly {
		readonly toolId: string;
		readonly name?: string;
		readonly description: string;
		readonly inputSchema: object;
		readonly handler: ToolHandler;
	}[];
}) =>
	defineReactiveNode({
		type: config.type,
		displayName: config.displayName,
		...(config.category !== undefined ? { category: config.category } : {}),
		...(config.description !== undefined
			? { description: config.description }
			: {}),
		...(config.icon !== undefined ? { icon: config.icon } : {}),
		uiSchema: [] as const,
		bind(_ctx, { configureOutput }) {
			const tools$ = statefulObservable({
				loader: () =>
					of(
						config.tools.map((tool): ToolHandle => ({
							toolId: tool.toolId,
							name: tool.name ?? tool.toolId,
							description: tool.description,
							inputSchema: tool.inputSchema,
							invoke: tool.handler,
						})),
					),
			});

			return {
				inputs: [],
				outputs: [
					configureOutput('tools', tools$, {
						wireType: TOOL_HANDLE_WIRE_TYPE,
					}),
				],
			};
		},
	});
