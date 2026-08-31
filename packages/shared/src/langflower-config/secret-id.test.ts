import { describe, expect, it } from 'vitest';
import { isValidSecretId } from './secret-id.js';

describe('isValidSecretId', () => {
	it('accepts env-style names', () => {
		expect(isValidSecretId('API_TOKEN')).toBe(true);
		expect(isValidSecretId('_private')).toBe(true);
		expect(isValidSecretId('a1')).toBe(true);
	});

	it('rejects empty, hyphen, and leading digit', () => {
		expect(isValidSecretId('')).toBe(false);
		expect(isValidSecretId('API-TOKEN')).toBe(false);
		expect(isValidSecretId('1TOKEN')).toBe(false);
		expect(isValidSecretId('API TOKEN')).toBe(false);
	});
});
