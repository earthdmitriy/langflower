import { describe, expect, it } from 'vitest';
import {
	isLlmRecoveryNotice,
	isLlmRecoverySuspended,
	recoveryNoticeText,
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
});
