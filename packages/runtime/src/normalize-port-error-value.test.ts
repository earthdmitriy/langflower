import { describe, expect, it } from 'vitest';
import { normalizePortErrorValue } from './normalize-port-error-value.js';

describe('normalizePortErrorValue', () => {
	it('passes string errors through', () => {
		expect(
			normalizePortErrorValue('Stopped: maxFeedbackTurns (3) reached'),
		).toBe('Stopped: maxFeedbackTurns (3) reached');
	});

	it('uses Error.message without stack', () => {
		expect(normalizePortErrorValue(new Error('boom'))).toBe('boom');
	});

	it('unwraps a flat combine tuple (false = no source error)', () => {
		expect(
			normalizePortErrorValue([
				false,
				new Error('boom'),
				false,
				false,
				false,
				false,
				false,
			]),
		).toBe('boom');
	});

	it('unwraps nested combine tuples', () => {
		expect(
			normalizePortErrorValue([
				false,
				[
					false,
					'Stopped: maxFeedbackTurns (3) reached',
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

	it('joins multiple truthy source errors', () => {
		expect(
			normalizePortErrorValue([
				false,
				new Error('first'),
				false,
				'second',
			]),
		).toBe('first\nsecond');
	});

	it('maps empty WS-serialized Error objects to Error', () => {
		expect(normalizePortErrorValue([false, {}, false])).toBe('Error');
	});

	it('reads message from CtxError-shaped payloads', () => {
		expect(
			normalizePortErrorValue({
				message: 'MCP system connect failed (bad): boom',
			}),
		).toBe('MCP system connect failed (bad): boom');
		expect(
			normalizePortErrorValue([
				false,
				{ message: 'MCP system connect failed (bad): boom' },
			]),
		).toBe('MCP system connect failed (bad): boom');
	});
});
