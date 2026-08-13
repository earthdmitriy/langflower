import { describe, expect, it } from 'vitest';
import {
	isLlmRecoveryNotice,
	isLlmRecoverySuspended,
	recoveryNoticeText,
	toLlmRecoveryPortValue,
} from './recovery-notice.js';

describe('recovery-notice', () => {
	it('guards structured notices', () => {
		expect(
			isLlmRecoveryNotice({
				code: 'retry',
				text: 'retrying',
			}),
		).toBe(true);
		expect(
			isLlmRecoverySuspended({
				code: 'suspended',
				text: 'paused',
			}),
		).toBe(true);
		expect(
			isLlmRecoverySuspended({
				code: 'retry',
				text: 'retrying',
			}),
		).toBe(false);
		expect(isLlmRecoveryNotice({ code: 'retry' })).toBe(false);
		expect(isLlmRecoveryNotice('⚠ text')).toBe(false);
		expect(
			isLlmRecoveryNotice({
				code: 'retry',
				text: 'retrying',
				attempt: 2,
				reason: 'dead-loop',
				nextAttemptAt: 1_000,
				backoffMs: 1,
			}),
		).toBe(true);
		expect(
			isLlmRecoverySuspended({
				code: 'retry',
				text: 'retrying',
				attempt: 1,
			}),
		).toBe(false);
	});

	it('extracts display text', () => {
		expect(
			recoveryNoticeText({
				code: 'suspended',
				text: 'Paused for Steer',
			}),
		).toBe('Paused for Steer');
		expect(recoveryNoticeText('plain')).toBe('plain');
		expect(recoveryNoticeText(null)).toBe('');
	});

	it('forwards additive timing fields onto the port value', () => {
		expect(
			toLlmRecoveryPortValue({
				code: 'retry',
				text: 'retrying',
				attempt: 2,
				reason: 'idle',
				lastAttemptAt: 10,
				nextAttemptAt: 20,
				backoffMs: 10,
			}),
		).toEqual({
			code: 'retry',
			text: 'retrying',
			attempt: 2,
			reason: 'idle',
			lastAttemptAt: 10,
			nextAttemptAt: 20,
			backoffMs: 10,
		});
	});
});
