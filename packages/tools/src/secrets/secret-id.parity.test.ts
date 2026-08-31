/**
 * Contract: tools owns `{lf_secrets:ID}` charset for the interpolator;
 * shared keeps a boundary twin (neither package may import the other in
 * production). Relative import of the twin source is test-only.
 */
import { describe, expect, it } from 'vitest';
import { isValidSecretId as sharedIsValid } from '../../../shared/src/langflower-config/secret-id.js';
import { isValidSecretId as toolsIsValid } from './secret-id.js';

const CASES: readonly string[] = [
	'API_TOKEN',
	'_private',
	'a1',
	'',
	'API-TOKEN',
	'1TOKEN',
	'API TOKEN',
	'A',
	'a_b',
];

describe('secret-id parity (tools twin ↔ shared)', () => {
	it('isValidSecretId matches for representative inputs', () => {
		for (const id of CASES) {
			expect(toolsIsValid(id)).toBe(sharedIsValid(id));
		}
	});
});
