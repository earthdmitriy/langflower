import { describe, expect, it } from 'vitest';
import { parseSwitchRules, resolveSwitchOutput } from './switch-rules.js';

describe('parseSwitchRules', () => {
	it('parses valid rule arrays', () => {
		expect(
			parseSwitchRules([
				{ match: 'plan', output: 'plan' },
				{ match: 'build', output: 'build' },
			]),
		).toEqual([
			{ match: 'plan', output: 'plan' },
			{ match: 'build', output: 'build' },
		]);
	});

	it('ignores invalid entries', () => {
		expect(parseSwitchRules([{ match: '', output: 'x' }, null, 1])).toEqual(
			[],
		);
	});
});

describe('resolveSwitchOutput', () => {
	const rules = [
		{ match: 'plan', output: 'plan' },
		{ match: 'build', output: 'build' },
	] as const;

	it('matches equals mode', () => {
		expect(resolveSwitchOutput('plan', rules, 'equals')).toBe('plan');
		expect(resolveSwitchOutput('other', rules, 'equals')).toBeUndefined();
	});

	it('uses default output', () => {
		expect(resolveSwitchOutput('other', rules, 'equals', 'fallback')).toBe(
			'fallback',
		);
	});

	it('matches regex mode', () => {
		expect(
			resolveSwitchOutput(
				'item-42',
				[{ match: '^item-', output: 'items' }],
				'regex',
			),
		).toBe('items');
	});
});
