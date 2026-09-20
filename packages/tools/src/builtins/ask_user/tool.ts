import type { BuiltinTool, HandlerContext } from '../types.js';
import { parseAskUserArgs } from './parse-ask-user-args.js';

const ASK_USER_ABORTED = 'ask_user aborted.';

const invokeWithAbort = (
	work: Promise<string>,
	signal: AbortSignal | undefined,
): Promise<string> => {
	if (signal === undefined) {
		return work;
	}

	if (signal.aborted) {
		return Promise.reject(new Error(ASK_USER_ABORTED));
	}

	return new Promise((resolve, reject) => {
		const onAbort = (): void => {
			signal.removeEventListener('abort', onAbort);
			reject(new Error(ASK_USER_ABORTED));
		};

		signal.addEventListener('abort', onAbort, { once: true });
		void work.then(
			(text) => {
				signal.removeEventListener('abort', onAbort);
				resolve(text);
			},
			(error: unknown) => {
				signal.removeEventListener('abort', onAbort);
				reject(
					error instanceof Error ? error : new Error(String(error)),
				);
			},
		);
	});
};

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const request = parseAskUserArgs(args);

	if (ctx.askUser === undefined) {
		throw new Error(
			'ask_user requires a live HITL host. No askUser hook is bound on this harness.',
		);
	}

	return invokeWithAbort(ctx.askUser(request), ctx.signal);
};

export const askUserTool = {
	id: 'ask_user',
	registration: {
		toolId: 'ask_user',
		name: 'ask_user',
		description:
			'Do not guess. If you are not sure, ask the user. Pauses the run so the operator can answer. Pass «question» for a freeform prompt, and/or ordered «questions» with optional choice lists. The operator sees every question at once, may select options (multi-select when allowMultiple is true), and may also type a freeform reply. One Send returns the answers.',
		inputSchema: {
			type: 'object',
			properties: {
				question: {
					type: 'string',
					description:
						'Headline or single freeform question. Required when questions is omitted.',
				},
				questions: {
					type: 'array',
					description:
						'Ordered questions shown together. Each may include options. Max 8.',
					items: {
						type: 'object',
						properties: {
							prompt: {
								type: 'string',
								description: 'Question text for the operator.',
							},
							options: {
								type: 'array',
								description:
									'Optional choice labels. Max 12. Empty means freeform only for this prompt.',
								items: { type: 'string' },
							},
							allowMultiple: {
								type: 'boolean',
								description:
									'When true, the operator may select several options for this question.',
							},
						},
						required: ['prompt'],
					},
				},
			},
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'ask_user'>;
