import { describe, expect, it } from 'vitest';
import type {
	CustomPaletteSnapshotPayload,
	PaletteNodeDefinition,
} from '@langflower/shared/langflower';
import {
	ADVANCED_CATEGORY,
	advancedSubcategoryCollapseKey,
	categoryCollapseKey,
	filterPaletteSections,
	paletteFromSnapshot,
	paletteFromSystemAndCustom,
	sourceSectionLabel,
} from '../types/palette-projection';

function node(
	overrides: Partial<PaletteNodeDefinition> &
		Pick<PaletteNodeDefinition, 'type' | 'displayName' | 'source'>,
): PaletteNodeDefinition {
	return {
		emitOncePerActivation: false,
		stopsRun: false,
		uiSchema: [],
		bypassPorts: {},
		inputsConfigs: [],
		outputsConfigs: [],
		...overrides,
	} as PaletteNodeDefinition;
}

describe('paletteFromSystemAndCustom', () => {
	it('groups system and custom from separate snapshots', () => {
		const state = paletteFromSystemAndCustom(
			{
				nodes: [
					node({
						type: 'common-number',
						displayName: 'Number',
						source: 'system',
						category: 'Primitives',
					}),
					node({
						type: 'common-string',
						displayName: 'String',
						source: 'system',
						category: 'Primitives',
					}),
				],
			},
			{
				nodes: [
					node({
						type: 'custom-widget',
						displayName: 'Widget',
						source: 'custom',
						category: 'Other',
					}),
				],
				errors: [],
				status: 'ok',
			},
		);

		expect(state.sections).toHaveLength(2);
		expect(state.sections[0]?.source).toBe('system');
		expect(
			state.sections[0]?.categories[0]?.nodes.map((n) => n.type),
		).toEqual(['common-number', 'common-string']);
		expect(state.sections[1]?.categories[0]?.nodes[0]?.type).toBe(
			'custom-widget',
		);
		expect(state.customStatus).toBe('ok');
	});

	it('surfaces compile errors without inventing custom nodes', () => {
		const custom: CustomPaletteSnapshotPayload = {
			nodes: [],
			errors: [
				{
					packageName: 'my-nodes',
					message: 'Failed to bundle broken.ts',
					diagnostics: [{ message: 'Unexpected token' }],
				},
			],
			status: 'error',
		};
		const state = paletteFromSystemAndCustom(
			{
				nodes: [
					node({
						type: 'common-preview',
						displayName: 'Preview',
						source: 'system',
						category: 'Output',
					}),
				],
			},
			custom,
		);

		expect(state.customStatus).toBe('error');
		expect(state.customErrors).toEqual(custom.errors);
		expect(state.sections[1]?.categories).toEqual([]);
	});

	it('leaves custom section empty when snapshot has only system nodes', () => {
		const state = paletteFromSnapshot({
			nodes: [
				node({
					type: 'common-preview',
					displayName: 'Preview',
					source: 'system',
					category: 'Output',
				}),
			],
		});

		expect(state.sections[1]?.categories).toEqual([]);
	});

	it('moves paletteSecondary nodes into Advanced subcategories', () => {
		const state = paletteFromSnapshot({
			nodes: [
				node({
					type: 'common-crawl-tools',
					displayName: 'Crawl Tools',
					source: 'system',
					category: 'Tools',
				}),
				node({
					type: 'common-memory-tools',
					displayName: 'Memory Tools',
					source: 'system',
					category: 'Tools',
				}),
				node({
					type: 'common-mcp-stdio',
					displayName: 'MCP stdio',
					source: 'system',
					category: 'Tools',
				}),
				node({
					type: 'common-router',
					displayName: 'Router',
					source: 'system',
					category: 'Flow',
				}),
				node({
					type: 'common-if',
					displayName: 'IF',
					source: 'system',
					category: 'Logic',
					paletteSecondary: true,
				}),
				node({
					type: 'common-merge',
					displayName: 'Merge',
					source: 'system',
					category: 'Flow',
					paletteSecondary: true,
				}),
				node({
					type: 'common-fetch-url',
					displayName: 'Fetch URL',
					source: 'system',
					category: 'Crawl',
					paletteSecondary: true,
				}),
			],
		});

		const system = state.sections[0];
		expect(system?.categories.map((g) => g.category)).toEqual([
			'Tools',
			'Flow',
			ADVANCED_CATEGORY,
		]);

		const toolsTypes = system?.categories
			.find((g) => g.category === 'Tools')
			?.nodes.map((n) => n.type);
		expect(toolsTypes).toHaveLength(3);
		expect(toolsTypes).toEqual(
			expect.arrayContaining([
				'common-crawl-tools',
				'common-memory-tools',
				'common-mcp-stdio',
			]),
		);

		expect(
			system?.categories
				.find((g) => g.category === 'Flow')
				?.nodes.map((n) => n.type),
		).toContain('common-router');

		const advanced = system?.categories.find(
			(g) => g.category === ADVANCED_CATEGORY,
		);
		expect(advanced?.nodes).toEqual([]);
		expect(advanced?.subcategories?.map((s) => s.category)).toEqual(
			expect.arrayContaining(['Logic', 'Flow', 'Crawl']),
		);
		expect(
			advanced?.subcategories
				?.find((s) => s.category === 'Logic')
				?.nodes.some((n) => n.type === 'common-if'),
		).toBe(true);
		expect(
			advanced?.subcategories
				?.find((s) => s.category === 'Flow')
				?.nodes.some((n) => n.type === 'common-merge'),
		).toBe(true);
		expect(
			advanced?.subcategories
				?.find((s) => s.category === 'Crawl')
				?.nodes.some((n) => n.type === 'common-fetch-url'),
		).toBe(true);
	});

	it('omits Advanced when no secondary nodes exist', () => {
		const state = paletteFromSnapshot({
			nodes: [
				node({
					type: 'common-string',
					displayName: 'String',
					source: 'system',
					category: 'Primitives',
				}),
			],
		});

		expect(
			state.sections[0]?.categories.some(
				(g) => g.category === ADVANCED_CATEGORY,
			),
		).toBe(false);
	});
});

describe('palette projection helpers', () => {
	it('builds collapse keys and labels', () => {
		expect(categoryCollapseKey('system', 'Primitives')).toBe(
			'system:Primitives',
		);
		expect(advancedSubcategoryCollapseKey('system', 'Crawl')).toBe(
			'system:Advanced:Crawl',
		);
		expect(sourceSectionLabel('custom')).toBe('Custom');
	});
});

describe('filterPaletteSections', () => {
	const sections = paletteFromSystemAndCustom(
		{
			nodes: [
				node({
					type: 'common-number',
					displayName: 'Number',
					source: 'system',
					category: 'Primitives',
				}),
				node({
					type: 'common-string',
					displayName: 'String',
					source: 'system',
					category: 'Primitives',
				}),
				node({
					type: 'common-fetch-url',
					displayName: 'Fetch URL',
					source: 'system',
					category: 'Crawl',
					paletteSecondary: true,
				}),
			],
		},
		{
			nodes: [
				node({
					type: 'custom-widget',
					displayName: 'Widget',
					source: 'custom',
					category: 'Other',
				}),
			],
			errors: [],
			status: 'ok',
		},
	).sections;

	it('returns all sections when query is empty', () => {
		expect(filterPaletteSections(sections, '  ')).toEqual(sections);
	});

	it('filters by displayName and drops empty groups', () => {
		const filtered = filterPaletteSections(sections, 'num');

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.source).toBe('system');
		expect(filtered[0]?.categories[0]?.nodes.map((n) => n.type)).toEqual([
			'common-number',
		]);
	});

	it('filters by type case-insensitively', () => {
		const filtered = filterPaletteSections(sections, 'CUSTOM-WIDGET');

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.categories[0]?.nodes[0]?.type).toBe(
			'custom-widget',
		);
	});

	it('keeps Advanced subcategory matches', () => {
		const filtered = filterPaletteSections(sections, 'fetch');

		expect(filtered).toHaveLength(1);
		const advanced = filtered[0]?.categories.find(
			(g) => g.category === ADVANCED_CATEGORY,
		);
		expect(advanced?.subcategories?.[0]?.nodes.map((n) => n.type)).toEqual([
			'common-fetch-url',
		]);
	});
});
