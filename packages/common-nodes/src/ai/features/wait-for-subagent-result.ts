import {
	filter,
	firstValueFrom,
	fromEvent,
	map,
	take,
	takeUntil,
	timeout,
	type Observable,
} from 'rxjs';
import {
	isSubAgentResultPayload,
	type SubAgentResultPayload,
} from './sub-agent-protocol.js';

const normalizeResult = (value: unknown): SubAgentResultPayload | null => {
	if (isSubAgentResultPayload(value)) {
		return value;
	}

	if (typeof value === 'string') {
		try {
			const parsed: unknown = JSON.parse(value);
			return isSubAgentResultPayload(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	return null;
};

const observeSubagentResult = (
	result$: Observable<unknown>,
	callId: string,
	signal: AbortSignal,
	timeoutMs = 0,
): Observable<string> => {
	const matching$ = result$.pipe(
		map(normalizeResult),
		filter(
			(payload): payload is SubAgentResultPayload =>
				payload !== null && payload.callId === callId,
		),
		map((payload) => payload.result),
		take(1),
		takeUntil(fromEvent(signal, 'abort')),
	);

	return timeoutMs > 0
		? matching$.pipe(timeout({ first: timeoutMs }))
		: matching$;
};

/**
 * Agent-node internal router: first matching `subagentResult` for `callId`,
 * aborted when the tool-loop AbortSignal fires (turn Observable teardown).
 */
export const waitForSubagentResult = (
	result$: Observable<unknown>,
	callId: string,
	signal: AbortSignal,
	timeoutMs = 0,
): Promise<string> =>
	signal.aborted
		? Promise.reject(new Error('Sub-Agent wait aborted'))
		: firstValueFrom(
				observeSubagentResult(result$, callId, signal, timeoutMs),
			);
