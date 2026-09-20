import type { LangflowerWsClient } from '@langflower/shared/langflower-ws-waits';
import type { Observable, Subject } from 'rxjs';
import type { ClientIntentKey } from './list-action-intents.js';
import type { ObserveEventKey } from './mcp-exposure-policy.js';

/** Typed inbound bus channel — no `Record` cast at call sites. */
export const observeEvent$ = (
	client: LangflowerWsClient,
	event: ObserveEventKey,
): Observable<unknown> => client[event] as Observable<unknown>;

/** Typed outbound intent subject — no `Record` cast at call sites. */
export const emitClientIntent = (
	client: LangflowerWsClient,
	intent: ClientIntentKey,
	payload: unknown,
): void => {
	const channel = client[intent] as Subject<unknown> | undefined;

	if (channel === undefined || typeof channel.next !== 'function') {
		throw new Error(`Unknown outbound intent: ${intent}`);
	}

	channel.next(payload);
};
