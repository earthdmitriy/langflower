import { statefulObservable } from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { defineReactiveNode } from '../define-reactive-node/define-reactive-node.js';
import {
	TOOL_HANDLE_WIRE_TYPE,
	type ToolHandle,
	type ToolHandler,
} from './tool-handle.js';

type RegistrationTool = {
	readonly toolId: string;
	readonly name?: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly handler: ToolHandler;
};

/** Map domain registrations onto wire {@link ToolHandle}s. */
export const toToolHandles = (
	tools: readonly RegistrationTool[],
): readonly ToolHandle[] =>
	tools.map((tool) => ({
		toolId: tool.toolId,
		name: tool.name ?? tool.toolId,
		description: tool.description,
		inputSchema: tool.inputSchema,
		invoke: tool.handler,
	}));

/**
 * Purpose utility atop {@link defineReactiveNode}: emit a `tools` pack as
 * {@link ToolHandle}[]. Config still takes domain `handler`s; factory maps
 * them to `invoke`.
 *
 * @example
 * ```ts
 * import { CRAWL_TOOL_CONFIGS } from '@langflower/tools/domain-tool-configs';
 *
 * export const crawlToolsNode = defineToolRegistrations({
 *   type: 'common-crawl-tools',
 *   displayName: 'Crawl Tools',
 *   category: 'Tools',
 *   tools: CRAWL_TOOL_CONFIGS,
 * });
 * ```
 */
export const defineToolRegistrations = (config: {
	readonly type: string;
	readonly displayName: string;
	readonly category?: string;
	readonly description?: string;
	readonly tools: readonly RegistrationTool[];
}) =>
	defineReactiveNode({
		type: config.type,
		displayName: config.displayName,
		...(config.category !== undefined ? { category: config.category } : {}),
		...(config.description !== undefined
			? { description: config.description }
			: {}),
		uiSchema: [] as const,
		bind(_ctx, { configureOutput }) {
			const tools$ = statefulObservable({
				loader: () => of(toToolHandles(config.tools)),
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
