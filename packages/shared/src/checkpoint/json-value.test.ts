import { describe, expect, it } from 'vitest';
import { toCheckpointJsonValue } from './json-value.js';

describe('toCheckpointJsonValue', () => {
	it('accepts primitives, arrays, and plain objects', () => {
		expect(toCheckpointJsonValue(null)).toBe(null);
		expect(toCheckpointJsonValue('a')).toBe('a');
		expect(toCheckpointJsonValue(1)).toBe(1);
		expect(toCheckpointJsonValue(true)).toBe(true);
		expect(toCheckpointJsonValue([1, 'x'])).toEqual([1, 'x']);
		expect(toCheckpointJsonValue({ a: 1 })).toEqual({ a: 1 });
	});

	it('rejects non-finite numbers, functions, and class instances', () => {
		expect(toCheckpointJsonValue(Number.NaN)).toBeUndefined();
		expect(toCheckpointJsonValue(() => 1)).toBeUndefined();
		expect(toCheckpointJsonValue(new Date())).toBeUndefined();
	});

	it('rejects circular structures', () => {
		const cyclic: { self?: unknown } = {};
		cyclic.self = cyclic;
		expect(toCheckpointJsonValue(cyclic)).toBeUndefined();
	});
});
