import { describe, expect, it } from 'vitest';
import { scoreCase } from './score-case.js';

describe('scoreCase', () => {
	it('exact matches trimmed strings', () => {
		expect(scoreCase('  hello  ', 'hello', 'exact')).toBe(1);
		expect(scoreCase('hello', 'Hello', 'exact')).toBe(0);
	});

	it('includes scores substring presence', () => {
		expect(scoreCase('prefix PASS suffix', 'PASS', 'includes')).toBe(1);
		expect(scoreCase('ok', 'PASS', 'includes')).toBe(0);
	});
});
