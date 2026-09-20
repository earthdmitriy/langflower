import type { RunId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { liveRecoveryTail } from '../latest-recovery-item';
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
