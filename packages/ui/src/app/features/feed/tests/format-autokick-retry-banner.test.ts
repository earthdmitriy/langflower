import { describe, expect, it } from 'vitest';
import {
	formatAutokickRetryBanner,
	formatAutokickRetryHeadline,
} from '../format-autokick-retry-banner';

describe('formatAutokickRetryBanner', () => {
	it('labels the first wait without a last-retry clock', () => {
		expect(
			formatAutokickRetryBanner(
				{
					code: 'retry',
					text: 'fallback',
					attempt: 1,
					reason: 'idle',
					backoffMs: 60_000,
					nextAttemptAt: 60_000,
				},
				0,
			),
		).toBe('Retrying idle stream · retry 1\nfirst wait · next in 1m 0s');
	});

	it('shows last retry and next countdown on later attempts', () => {
		expect(
			formatAutokickRetryBanner(
				{
					code: 'retry',
					text: 'fallback',
					attempt: 3,
					reason: 'dead-loop',
					backoffMs: 240_000,
					lastAttemptAt: 0,
					nextAttemptAt: 240_000,
				},
				72_000,
			),
		).toBe(
			'Retrying dead loop · retry 3\nLast retry 1m 12s ago · next in 2m 48s',
		);
	});

	it('stops the next-retry countdown after nextAttemptAt', () => {
		expect(
			formatAutokickRetryBanner(
				{
					code: 'retry',
					text: 'fallback',
					attempt: 2,
					reason: 'idle',
					lastAttemptAt: 0,
					nextAttemptAt: 1_000,
				},
				5_000,
			),
		).toBe('Retrying idle stream · retry 2\nLast retry 5s ago');
	});

	it('labels rate-limit and network waits', () => {
		expect(
			formatAutokickRetryBanner(
				{
					code: 'retry',
					text: 'fallback',
					attempt: 1,
					reason: 'rate-limit',
					backoffMs: 60_000,
					nextAttemptAt: 60_000,
				},
				0,
			),
		).toBe('Retrying rate limit · retry 1\nfirst wait · next in 1m 0s');
		expect(
			formatAutokickRetryBanner(
				{
					code: 'retry',
					text: 'fallback',
					attempt: 2,
					reason: 'network',
					lastAttemptAt: 0,
					nextAttemptAt: 5_000,
				},
				2_000,
			),
		).toBe(
			'Retrying network error · retry 2\nLast retry 2s ago · next in 3s',
		);
	});
});

describe('formatAutokickRetryHeadline', () => {
	it('omits the wait timer on older recovery rows', () => {
		expect(
			formatAutokickRetryHeadline({
				code: 'retry',
				text: 'fallback',
				attempt: 1,
				reason: 'idle',
				backoffMs: 60_000,
				nextAttemptAt: 60_000,
			}),
		).toBe('Retrying idle stream · retry 1');
	});
});
