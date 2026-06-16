import { describe, expect, it } from 'vitest';
import { resolveWaitEventMode } from './wait-event-mode.js';

describe('resolveWaitEventMode', () => {
	it('defaults to latest', () => {
		expect(resolveWaitEventMode({})).toBe('latest');
	});

	it('honors mode', () => {
		expect(resolveWaitEventMode({ mode: 'next' })).toBe('next');
		expect(resolveWaitEventMode({ mode: 'latest' })).toBe('latest');
	});
});
