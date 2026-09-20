import {
	type ToolHandle,
	type ToolHandler,
	type ToolHandlerContext,
} from '@langflower/node-sdk';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { Observable } from 'rxjs';

type RegistrationTool = {
	readonly toolId: string;
	readonly name?: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly handler: ToolHandler;
};

const isToolHandlerContext = (value: unknown): value is ToolHandlerContext => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record['projectDir'] === 'string' &&
		typeof record['runId'] === 'string'
	);
};

/**
 * Emit a `tools` pack, closing over **this** node's EC at bind so bus RPC
 * stays on the pack instance (not agent `toolCtx`). Local to this folder —
 * not the author SDK factory.
 */
export const emitRegistrationTools = (
	ctx: { readonly value$: Observable<unknown> },
	tools: readonly RegistrationTool[],
) =>
	statefulObservable({
		loader: () =>
			new Observable<readonly ToolHandle[]>((subscriber) => {
				let nodeCtx: ToolHandlerContext | undefined;
				const inner = ctx.value$.subscribe((value) => {
					if (isToolHandlerContext(value)) {
						nodeCtx = value;
					}
				});
				subscriber.next(
					tools.map((tool): ToolHandle => ({
						toolId: tool.toolId,
						name: tool.name ?? tool.toolId,
						description: tool.description,
						inputSchema: tool.inputSchema,
						invoke: (args, agentCtx) =>
							tool.handler(args, nodeCtx ?? agentCtx),
					})),
				);
				return () => inner.unsubscribe();
			}),
	});
