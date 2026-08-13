import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	isLatestRecoveryRow,
	latestRecoveryItem,
	liveRecoveryTail,
} from '../latest-recovery-item';
import type { PortStreamItem } from '../types';

const item = (
	seq: number,
	presentation: 'recovery' | 'draft',
): PortStreamItem => ({
	source: 'port',
	runId: 'run-1' as RunId,
	state: 'value',
	value: { code: 'retry', text: `n${seq}` },
	meta: { presentation },
	seq,
});

describe('latestRecoveryItem', () => {
	it('returns undefined when there is no recovery row', () => {
		expect(latestRecoveryItem([item(0, 'draft')])).toBeUndefined();
		expect(latestRecoveryItem([])).toBeUndefined();
	});

	it('picks the highest-seq recovery row', () => {
		expect(
			latestRecoveryItem([
				item(1, 'recovery'),
				item(2, 'draft'),
				item(4, 'recovery'),
				item(3, 'recovery'),
			]),
		).toMatchObject({ seq: 4 });
	});
});

describe('liveRecoveryTail', () => {
	it('returns the last item only when it is recovery', () => {
		expect(
			liveRecoveryTail([
				item(1, 'recovery'),
				item(2, 'draft'),
				item(3, 'recovery'),
			]),
		).toMatchObject({ seq: 3 });
	});

	it('is undefined when reasoning or draft follows recovery', () => {
		expect(
			liveRecoveryTail([item(1, 'recovery'), item(2, 'draft')]),
		).toBeUndefined();
		expect(liveRecoveryTail([])).toBeUndefined();
	});
});

describe('isLatestRecoveryRow', () => {
	it('matches the highest-seq recovery row', () => {
		const latest = item(4, 'recovery');
		expect(isLatestRecoveryRow(latest, item(4, 'recovery'))).toBe(true);
		expect(isLatestRecoveryRow(latest, item(1, 'recovery'))).toBe(false);
	});

	it('is false when there is no latest recovery', () => {
		expect(isLatestRecoveryRow(undefined, item(1, 'recovery'))).toBe(false);
	});
});
