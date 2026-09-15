import { asString } from '../args.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

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
	const question = asString(args, 'question');

	if (question === undefined || question.trim().length === 0) {
		throw new Error('ask_user requires string argument «question».');
	}

	if (ctx.askUser === undefined) {
		throw new Error(
			'ask_user requires a live HITL host. No askUser hook is bound on this harness.',
		);
	}

	return invokeWithAbort(
		ctx.askUser({ question: question.trim() }),
		ctx.signal,
	);
};

export const askUserTool = {
	id: 'ask_user',
	registration: {
		toolId: 'ask_user',
		name: 'ask_user',
		description:
			'Do not guess. If you are not sure, ask the user. Pauses the run so the operator can provide additional information.',
		inputSchema: {
			type: 'object',
			properties: {
				question: {
					type: 'string',
					description:
						'The question to show the operator. Be specific about what you need.',
				},
			},
			required: ['question'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'ask_user'>;
