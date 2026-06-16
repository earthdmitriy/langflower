/**
 * Resolve wait_event mode from tool args.
 *
 * - `latest` (default): return last cached payload if any, else wait for first.
 * - `next`: wait for an emission that arrives after the call starts.
 */
export type WaitEventMode = 'latest' | 'next';

export const resolveWaitEventMode = (
	args: Readonly<Record<string, unknown>>,
): WaitEventMode => {
	if (args['mode'] === 'next' || args['mode'] === 'latest') {
		return args['mode'];
	}

	// Default latest — agents usually want "current state", not "future frame".
	// Hot `runner.output-emitted` with mode=next easily hangs after the stream ends.
	return 'latest';
};
