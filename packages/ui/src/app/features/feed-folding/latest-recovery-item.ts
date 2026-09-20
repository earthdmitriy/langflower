import type { PortStreamItem } from './types';

/**
 * Live wait banner: the visit tail, only when that tail is a recovery row.
 * Reasoning/draft/result after reconnect clears this — no ticking timer on
 * historical retries.
 */
export const liveRecoveryTail = (
	items: readonly PortStreamItem[],
): PortStreamItem | undefined => {
	const last = items[items.length - 1];
	return last?.meta.presentation === 'recovery' ? last : undefined;
};
