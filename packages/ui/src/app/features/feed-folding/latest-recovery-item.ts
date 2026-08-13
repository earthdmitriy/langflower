import type { PortStreamItem } from './types';

/** Latest chronological recovery row in a visit (highest seq). */
export const latestRecoveryItem = (
	items: readonly PortStreamItem[],
): PortStreamItem | undefined => {
	let latest: PortStreamItem | undefined;
	for (const item of items) {
		if (item.meta.presentation !== 'recovery') {
			continue;
		}
		if (latest === undefined || item.seq > latest.seq) {
			latest = item;
		}
	}
	return latest;
};

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

/** True when `item` is the live recovery tail (ticking timer). */
export const isLatestRecoveryRow = (
	latest: PortStreamItem | undefined,
	item: PortStreamItem,
): boolean => latest !== undefined && item.seq === latest.seq;
