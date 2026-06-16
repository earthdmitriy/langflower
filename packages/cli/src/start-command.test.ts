import { describe, expect, it } from 'vitest';
import { parseListenPort } from './start-command.js';

describe('parseListenPort', () => {
	it('accepts ports in 1..65535', () => {
		expect(parseListenPort('1')).toBe(1);
		expect(parseListenPort('4010')).toBe(4010);
		expect(parseListenPort('65535')).toBe(65535);
	});

	it('rejects non-integers and out-of-range values', () => {
		expect(() => parseListenPort('0')).toThrow(/Invalid --port/);
		expect(() => parseListenPort('65536')).toThrow(/Invalid --port/);
		expect(() => parseListenPort('4.5')).toThrow(/Invalid --port/);
		expect(() => parseListenPort('abc')).toThrow(/Invalid --port/);
		expect(() => parseListenPort('-1')).toThrow(/Invalid --port/);
		expect(() => parseListenPort('')).toThrow(/Invalid --port/);
	});
});
