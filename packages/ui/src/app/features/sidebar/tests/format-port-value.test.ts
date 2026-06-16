import { describe, expect, it } from 'vitest';
import { formatPortValue } from '../format-port-value';

describe('formatPortValue', () => {
	it('passes strings through unchanged', () => {
		expect(formatPortValue('hello')).toBe('hello');
	});

	it('pretty-prints objects as JSON', () => {
		expect(formatPortValue({ a: 1 })).toBe('{\n  "a": 1\n}');
	});

	it('pretty-prints arrays as JSON', () => {
		expect(formatPortValue([1, 2, 3])).toBe('[\n  1,\n  2,\n  3\n]');
	});

	it('stringifies numbers and booleans', () => {
		expect(formatPortValue(42)).toBe('42');
		expect(formatPortValue(true)).toBe('true');
	});

	it('stringifies null and undefined', () => {
		expect(formatPortValue(null)).toBe('null');
		expect(formatPortValue(undefined)).toBe('undefined');
	});

	it('shows Error.message without JSON {}', () => {
		expect(formatPortValue(new Error('boom'))).toBe('boom');
	});

	it('unwraps nested combine error tuples (false = no source error)', () => {
		expect(
			formatPortValue([
				false,
				[
					false,
					new Error('Stopped: maxFeedbackTurns (3) reached'),
					false,
					false,
					false,
					false,
					false,
				],
				false,
				false,
				false,
				false,
				false,
			]),
		).toBe('Stopped: maxFeedbackTurns (3) reached');
	});

	it('unwraps string leaves in combine tuples', () => {
		expect(
			formatPortValue([
				false,
				'Stopped: maxFeedbackTurns (3) reached',
				false,
			]),
		).toBe('Stopped: maxFeedbackTurns (3) reached');
	});
});
