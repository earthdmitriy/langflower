import { describe, expect, it } from 'vitest';
import { runReadClassPostProcess } from './post-process.js';

describe('runReadClassPostProcess', () => {
	it('transforms successful string output', () => {
		expect(
			runReadClassPostProcess('(res) => res.slice(0, 3)', 'abcdef'),
		).toBe('abc');
	});

	it('rejects non-string return', () => {
		expect(() =>
			runReadClassPostProcess('(res) => res.length', 'abc'),
		).toThrow(/must return a string/i);
	});

	it('rejects empty source', () => {
		expect(() => runReadClassPostProcess('   ', 'abc')).toThrow(/empty/i);
	});
});
