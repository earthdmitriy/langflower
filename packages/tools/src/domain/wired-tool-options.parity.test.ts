/**
 * Contract: tools owns builtin + domain pack tool ids; shared inspector
 * catalogs (`HARNESS_BUILTIN_TOOL_OPTIONS` / `DOMAIN_PACK_TOOL_OPTIONS`) must
 * stay aligned. Relative import of the shared twin is test-only.
 */
import { describe, expect, it } from 'vitest';
import {
	DOMAIN_PACK_TOOL_OPTIONS,
	HARNESS_BUILTIN_TOOL_OPTIONS,
} from '../../../shared/src/langflower-config/resolve-wired-tool-options.js';
import { BUILTIN_TOOL_IDS } from '../builtins/catalog.js';
import {
	CRAWL_TOOL_CONFIGS,
	MEMORY_TOOL_CONFIGS,
} from './domain-tool-configs.js';

const optionValues = (
	options: readonly { readonly value: unknown }[],
): readonly string[] => options.map((option) => String(option.value)).sort();

const configToolIds = (
	configs: readonly { readonly toolId: string }[],
): readonly string[] => configs.map((config) => config.toolId).sort();

describe('wired-tool-options parity (tools owner ↔ shared inspector catalogs)', () => {
	it('HARNESS_BUILTIN_TOOL_OPTIONS matches BUILTIN_TOOL_IDS', () => {
		expect(optionValues(HARNESS_BUILTIN_TOOL_OPTIONS)).toEqual(
			[...BUILTIN_TOOL_IDS].sort(),
		);
	});

	it('DOMAIN_PACK_TOOL_OPTIONS match domain tool configs', () => {
		expect(
			optionValues(DOMAIN_PACK_TOOL_OPTIONS['common-crawl-tools'] ?? []),
		).toEqual(configToolIds(CRAWL_TOOL_CONFIGS));
		expect(
			optionValues(DOMAIN_PACK_TOOL_OPTIONS['common-memory-tools'] ?? []),
		).toEqual(configToolIds(MEMORY_TOOL_CONFIGS));
		expect(DOMAIN_PACK_TOOL_OPTIONS['common-kb-tools']).toBeUndefined();
	});
});
