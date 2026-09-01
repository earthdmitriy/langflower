import {
	defineReactiveNode,
	TOOL_HANDLE_WIRE_TYPE,
	withLoading,
	type ToolHandle,
} from '@langflower/node-sdk';
import { concatMap, EMPTY, from, of, throwError } from 'rxjs';
import { flattenToolHandles } from '../collect-agent-tool-handles.js';

const isArgsObject = (
	value: unknown,
): value is Readonly<Record<string, unknown>> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const flattenWiredHandles = (wired: unknown): readonly ToolHandle[] => {
	const flattened = Array.isArray(wired)
		? flattenToolHandles(wired)
		: flattenToolHandles(
				wired === undefined || wired === null ? [] : [wired],
			);
	const byId = new Map<string, ToolHandle>();
	for (const handle of flattened) {
		byId.set(handle.toolId, handle);
	}

	return [...byId.values()];
};

const parseInvokeArgs = (
	raw: unknown,
):
	| { readonly ok: true; readonly args: Readonly<Record<string, unknown>> }
	| { readonly ok: false; readonly message: string } => {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (trimmed.length === 0 || trimmed === '[object Object]') {
			return { ok: true, args: {} };
		}

		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (!isArgsObject(parsed)) {
				return {
					ok: false,
					message: 'Tool invoke args must be a JSON object.',
				};
			}

			return { ok: true, args: parsed };
		} catch {
			return {
				ok: false,
				message: 'Tool invoke args is not valid JSON.',
			};
		}
	}

	if (raw === undefined || raw === null) {
		return { ok: true, args: {} };
	}

	if (!isArgsObject(raw)) {
		return {
			ok: false,
			message: 'Tool invoke args must be a JSON object.',
		};
	}

	return { ok: true, args: raw };
};

const findHandle = (
	tools: readonly ToolHandle[],
	toolId: string,
): ToolHandle | undefined =>
	tools.find(
		(tool) =>
			tool.toolId === toolId ||
			(tool.toolId.length === 0 && tool.name === toolId),
	);

type InvokeCall = {
	readonly handle: ToolHandle;
	readonly args: Readonly<Record<string, unknown>>;
	readonly projectDir: string;
	readonly runId: string;
};

/**
 * Call one wired {@link ToolHandle} from the graph (no LLM).
 * New `toolId` / `args` / `runId` fire; the same pair after a tools
 * reconnect in the same run does not (see `lastCallKey` in `bind`).
 */
export const toolInvokeNode = defineReactiveNode({
	type: 'common-tool-invoke',
	displayName: 'Tool invoke',
	category: 'Tools',
	description: `
Call one wired tool by id with JSON args. No model in the loop.

Typical uses:
- Run an MCP tool from a trigger or a constant
- Drive a pack tool with a typed graph instead of chat
`.trim(),
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		// Fire-gate, not a result cache: we never store or replay invoke
		// output. `combineInputs` re-emits when MCP pushes a new ToolHandle[]
		// with the same ids (new array identity). Without this skip, that
		// reconnect would call `handle.invoke` again with the same args.
		// `runId` is part of the key so a later Start is a new call; the
		// instance (and this variable) survive `done` → next `start`.
		let lastCallKey: string | undefined;

		const tools = makeInput<unknown>('tools', {
			name: 'tools',
			wireType: TOOL_HANDLE_WIRE_TYPE,
			required: true,
		});
		const toolId = makeInput<string>('toolId', {
			name: 'toolId',
			wireType: 'string',
			inline: 'text',
			required: true,
			defaultValue: '',
		});
		const args = makeInput<unknown>('args', {
			name: 'args',
			wireType: 'json',
			inline: 'text-multiline',
			// Empty string, not `{}`: the textarea uses String(value), and
			// persist strips blank strings then re-applies defaultValue
			// (`[object Object]` loop). `null`/`undefined` still cannot be
			// connected (`isSuccess`). Parse treats '' as no-arg `{}`.
			defaultValue: '',
		});

		const call$ = combineInputs(
			[tools, toolId, args, ctx],
			([wired, rawId, rawArgs, ec]) => ({
				handles: flattenWiredHandles(wired),
				toolId: String(rawId ?? '').trim(),
				rawArgs,
				projectDir: String(ec.projectDir ?? ''),
				runId: String(ec.runId ?? ''),
			}),
		).pipeValue(
			concatMap((payload) => {
				if (
					payload.handles.length === 0 ||
					payload.toolId.length === 0
				) {
					return EMPTY;
				}

				const parsed = parseInvokeArgs(payload.rawArgs);
				if (!parsed.ok) {
					return throwError(() => new Error(parsed.message));
				}

				const callKey = JSON.stringify({
					runId: payload.runId,
					toolId: payload.toolId,
					args: parsed.args,
				});
				// Same run + same call: drop this emission (EMPTY), do not
				// re-emit the previous result. Skip here, before withLoading,
				// so a reconnect does not stamp pending and hang.
				if (callKey === lastCallKey) {
					return EMPTY;
				}

				const handle = findHandle(payload.handles, payload.toolId);
				if (handle === undefined) {
					return throwError(
						() =>
							new Error(
								`Tool «${payload.toolId}» is not in the wired inventory.`,
							),
					);
				}

				lastCallKey = callKey;

				return of({
					handle,
					args: parsed.args,
					projectDir: payload.projectDir,
					runId: payload.runId,
				} satisfies InvokeCall);
			}),
		);

		const result$ = call$.pipe(withLoading()).pipeValue(
			concatMap((call) =>
				from(
					call.handle.invoke(call.args, {
						projectDir: call.projectDir,
						runId: call.runId,
					}),
				),
			),
		);

		return {
			inputs: [tools, toolId, args],
			outputs: [
				configureOutput('result', result$, {
					wireType: 'string',
				}),
			],
		};
	},
});
