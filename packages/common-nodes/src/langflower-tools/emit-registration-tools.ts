import {
	type ToolHandle,
	type ToolHandler,
	type ToolHandlerContext,
} from '@langflower/node-sdk';
import { statefulObservable } from '@rx-evo/stateful-observable';
import { of, type Observable } from 'rxjs';

type RegistrationTool = {
	readonly toolId: string;
	readonly name?: string;
	readonly description: string;
	readonly inputSchema: object;
	readonly handler: ToolHandler;
};

const peekNodeContext = (source: {
	readonly value$: Observable<unknown>;
}): ToolHandlerContext | undefined => {
	let peeked: unknown;
	const sub = source.value$.subscribe((value) => {
		peeked = value;
	});
	sub.unsubscribe();
	return typeof peeked === 'object' && peeked !== null
		? (peeked as ToolHandlerContext)
		: undefined;
};

/**
 * Emit a `tools` pack, peeking **this** node's EC at invoke so bus RPC
 * stays on the pack instance (not agent `toolCtx`). Local to this folder —
 * not the author SDK factory.
 */
export const emitRegistrationTools = (
	ctx: { readonly value$: Observable<unknown> },
	tools: readonly RegistrationTool[],
) =>
	statefulObservable({
		loader: () =>
			of(
				tools.map((tool): ToolHandle => ({
					toolId: tool.toolId,
					name: tool.name ?? tool.toolId,
					description: tool.description,
					inputSchema: tool.inputSchema,
					invoke: (args, agentCtx) => {
						const nodeCtx = peekNodeContext(ctx);
						return tool.handler(args, nodeCtx ?? agentCtx);
					},
				})),
			),
	});
