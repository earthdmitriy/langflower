import { describe, expect, it } from 'vitest';
import {
	AGENT_MAX_ITERATIONS_CAP,
	DEFAULT_AGENT_MAX_ITERATIONS,
	DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
	PATH_CHOICE_MAX_ITERATIONS_CAP,
	normalizeMaxIterations,
} from './normalize-max-iterations.js';

describe('normalizeMaxIterations', () => {
	const agent = {
		fallback: DEFAULT_AGENT_MAX_ITERATIONS,
		maxCap: AGENT_MAX_ITERATIONS_CAP,
	};
	const pathChoice = {
		fallback: DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
		maxCap: PATH_CHOICE_MAX_ITERATIONS_CAP,
	};

	it('treats 0 as unlimited', () => {
		expect(normalizeMaxIterations(0, agent)).toBe(0);
		expect(normalizeMaxIterations(0, pathChoice)).toBe(0);
	});

	it('falls back for invalid or negative values', () => {
		expect(normalizeMaxIterations(undefined, agent)).toBe(
			DEFAULT_AGENT_MAX_ITERATIONS,
		);
		expect(normalizeMaxIterations(-1, pathChoice)).toBe(
			DEFAULT_PATH_CHOICE_MAX_ITERATIONS,
		);
		expect(normalizeMaxIterations(Number.NaN, agent)).toBe(
			DEFAULT_AGENT_MAX_ITERATIONS,
		);
	});

	it('floors positive values and clamps only at maxCap', () => {
		expect(normalizeMaxIterations(3.9, agent)).toBe(3);
		expect(normalizeMaxIterations(100, agent)).toBe(100);
		expect(normalizeMaxIterations(10_000, agent)).toBe(10_000);
		expect(normalizeMaxIterations(100, { fallback: 5, maxCap: 32 })).toBe(
			32,
		);
	});
});
