import { describe, expect, it } from 'vitest';
import {
	autokickBackoffMs,
	autokickKickUserTurn,
	autokickPenalties,
	clampChatPenalty,
} from './autokick-recovery.js';
import { DEFAULT_AUTOKICK_USER_MESSAGE } from './llm-loop-types.js';

describe('autokick-recovery', () => {
	it('doubles backoff from 1 to 16 minutes then clamps', () => {
		const baseMs = 60_000;
		const maxMs = 960_000;

		expect(autokickBackoffMs(1, baseMs, maxMs)).toBe(60_000);
		expect(autokickBackoffMs(2, baseMs, maxMs)).toBe(120_000);
		expect(autokickBackoffMs(3, baseMs, maxMs)).toBe(240_000);
		expect(autokickBackoffMs(4, baseMs, maxMs)).toBe(480_000);
		expect(autokickBackoffMs(5, baseMs, maxMs)).toBe(960_000);
		expect(autokickBackoffMs(6, baseMs, maxMs)).toBe(960_000);
	});

	it('clamps penalties to [-2, 2]', () => {
		expect(clampChatPenalty(3)).toBe(2);
		expect(clampChatPenalty(-4)).toBe(-2);
		expect(
			autokickPenalties(10, { frequency: 0.3, presence: -0.3 }),
		).toEqual({
			frequency: 2,
			presence: -2,
		});
	});

	it('builds the default kick user turn', () => {
		expect(autokickKickUserTurn(DEFAULT_AUTOKICK_USER_MESSAGE)).toEqual({
			role: 'user',
			content:
				'I notice you are repeating yourself. Please stop and provide a concise answer.',
		});
	});
});
