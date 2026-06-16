import { describe, expect, it } from 'vitest';
import { evaluateCompare, parseCompareOp } from './evaluate-compare.js';

describe('evaluateCompare', () => {
	it('compares equality and inequality', () => {
		expect(evaluateCompare(1, 1, 'eq')).toBe(true);
		expect(evaluateCompare(1, 2, 'eq')).toBe(false);
		expect(evaluateCompare(1, 2, 'ne')).toBe(true);
	});

	it('compares numeric ordering', () => {
		expect(evaluateCompare(1, 2, 'lt')).toBe(true);
		expect(evaluateCompare(2, 1, 'gt')).toBe(true);
		expect(evaluateCompare(2, 2, 'lte')).toBe(true);
		expect(evaluateCompare(2, 2, 'gte')).toBe(true);
	});

	it('supports contains and regex matches', () => {
		expect(evaluateCompare('hello world', 'world', 'contains')).toBe(true);
		expect(evaluateCompare('item-42', '^item-', 'matches')).toBe(true);
		expect(evaluateCompare('item-42', '[', 'matches')).toBe(false);
	});
});

describe('parseCompareOp', () => {
	it('falls back to eq for unknown values', () => {
		expect(parseCompareOp('gt')).toBe('gt');
		expect(parseCompareOp('nope')).toBe('eq');
	});
});
