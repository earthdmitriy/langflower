import { asNumber } from '../args.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const SLEEP_MIN_SECONDS = 1;
const SLEEP_MAX_SECONDS = 300;

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const seconds = asNumber(args, 'seconds');

	if (seconds === undefined || !Number.isInteger(seconds)) {
		throw new Error('sleep requires integer argument «seconds» (1–300).');
	}

	if (seconds < SLEEP_MIN_SECONDS || seconds > SLEEP_MAX_SECONDS) {
		throw new Error(
			`sleep «seconds» must be between ${String(SLEEP_MIN_SECONDS)} and ${String(SLEEP_MAX_SECONDS)}.`,
		);
	}

	const signal = ctx.signal;

	await new Promise<void>((resolve, reject) => {
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(new Error('sleep aborted.'));
		};

		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, seconds * 1000);

		if (signal?.aborted) {
			clearTimeout(timer);
			reject(new Error('sleep aborted.'));
			return;
		}

		signal?.addEventListener('abort', onAbort);
	});

	return `Slept ${String(seconds)}s.`;
};

export const sleepTool = {
	id: 'sleep',
	registration: {
		toolId: 'sleep',
		name: 'sleep',
		description:
			'Wait a bounded number of seconds (1–300) without bash. Stop aborts the wait. Not a job-wait and not canvas Delay.',
		inputSchema: {
			type: 'object',
			properties: {
				seconds: {
					type: 'integer',
					minimum: SLEEP_MIN_SECONDS,
					maximum: SLEEP_MAX_SECONDS,
					description:
						'Seconds to wait (integer, 1–300). Over the cap is an error.',
				},
			},
			required: ['seconds'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'sleep'>;
