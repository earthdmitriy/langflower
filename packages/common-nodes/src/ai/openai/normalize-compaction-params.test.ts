import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CONTEXT_SIZE,
	DISABLED_COMPACTION_CONFIG,
	normalizeCompactOnError,
	normalizeCompactionConfig,
	normalizeContextSize,
} from './normalize-compaction-params.js';

describe('normalizeCompactionConfig', () => {
	it('uses Inspector default for invalid contextSize', () => {
		expect(normalizeContextSize('nope')).toBe(DEFAULT_CONTEXT_SIZE);
		expect(normalizeContextSize(undefined)).toBe(DEFAULT_CONTEXT_SIZE);
	});

	it('treats non-positive as disabled proactive budget', () => {
		expect(normalizeContextSize(0)).toBe(0);
		expect(normalizeContextSize(-12)).toBe(0);
	});

	it('clamps huge values', () => {
		expect(normalizeContextSize(9_999_999)).toBe(1_000_000);
	});

	it('requires strict true for compactOnError', () => {
		expect(normalizeCompactOnError(true)).toBe(true);
		expect(normalizeCompactOnError('true')).toBe(false);
		expect(normalizeCompactOnError(1)).toBe(false);
	});

	it('assembles config from params', () => {
		expect(
			normalizeCompactionConfig({
				contextSize: 4096,
				compactOnError: true,
			}),
		).toEqual({ contextSize: 4096, compactOnError: true });
		expect(DISABLED_COMPACTION_CONFIG).toEqual({
			contextSize: 0,
			compactOnError: false,
		});
	});
});
