import { describe, expect, it } from 'vitest';
import { makeInput } from './io-helpers.js';

describe('makeInput wire type', () => {
	it('keeps a scalar wire type as declared', () => {
		const input = makeInput<string>('text', { wireType: 'string' });
		expect(input.meta?.wireType).toBe('string');
	});

	it('keeps a union list and defaults to any', () => {
		const union = makeInput<string>('text', {
			wireType: ['string', 'user-turn'],
		});
		expect(union.meta?.wireType).toEqual(['string', 'user-turn']);
		expect(makeInput<string>('plain', {}).meta?.wireType).toBe('any');
	});
});
