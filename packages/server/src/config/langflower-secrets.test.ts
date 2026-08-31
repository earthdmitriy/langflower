import { describe, expect, it } from 'vitest';
import {
	mergeLangflowerSecrets,
	parseLangflowerSecrets,
} from './langflower-secrets.js';

describe('parseLangflowerSecrets', () => {
	it('keeps valid non-empty string entries', () => {
		expect(
			parseLangflowerSecrets({
				API_TOKEN: ' secret ',
				bad: 1,
				'API-TOKEN': 'x',
				EMPTY: '  ',
			}),
		).toEqual({ API_TOKEN: 'secret' });
	});

	it('returns empty for non-objects', () => {
		expect(parseLangflowerSecrets(null)).toEqual({});
		expect(parseLangflowerSecrets([])).toEqual({});
	});
});

describe('mergeLangflowerSecrets', () => {
	it('returns undefined when both patch fields are omitted', () => {
		expect(mergeLangflowerSecrets({ API_TOKEN: 'a' }, {})).toBeUndefined();
	});

	it('upserts when only secretValues is set', () => {
		expect(
			mergeLangflowerSecrets(
				{ KEEP: 'old', REPLACE: 'prev' },
				{ secretValues: { REPLACE: 'next', NEW: 'n', BAD: '' } },
			),
		).toEqual({ KEEP: 'old', REPLACE: 'next', NEW: 'n' });
	});

	it('replaces the id set when secretIds is set', () => {
		expect(
			mergeLangflowerSecrets(
				{ KEEP: 'old', DROP: 'gone' },
				{
					secretIds: ['KEEP', 'NEW', '1BAD'],
					secretValues: { NEW: 'fresh' },
				},
			),
		).toEqual({ KEEP: 'old', NEW: 'fresh' });
	});
});
