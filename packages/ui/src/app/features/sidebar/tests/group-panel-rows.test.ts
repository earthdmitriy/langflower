import type { UISchemaGroup } from '@langflower/node-sdk/create-typed-ui-schema';
import { describe, expect, it } from 'vitest';
import { groupPanelRows } from '../group-panel-rows';

const advanced = { label: 'Advanced', collapsed: true } as const;
const tools = { label: 'Tools' } as const;

type Row = { readonly field: string; readonly group?: UISchemaGroup };

const group = (rows: readonly Row[]) => groupPanelRows('n1', rows);

describe('groupPanelRows', () => {
	it('puts unmarked rows into an open General group', () => {
		const groups = group([{ field: 'a' }, { field: 'b' }]);

		expect(groups).toEqual([
			{
				key: 'n1:General',
				label: 'General',
				collapsed: false,
				order: Number.NEGATIVE_INFINITY,
				rows: [{ field: 'a' }, { field: 'b' }],
			},
		]);
	});

	it('orders groups by first appearance and keeps row order', () => {
		const groups = group([
			{ field: 'a' },
			{ field: 'b', group: advanced },
			{ field: 'c', group: tools },
			{ field: 'd' },
			{ field: 'e', group: advanced },
		]);

		expect(groups.map((g) => g.label)).toEqual([
			'General',
			'Advanced',
			'Tools',
		]);
		expect(groups[0]?.rows.map((r) => r.field)).toEqual(['a', 'd']);
		expect(groups[1]?.rows.map((r) => r.field)).toEqual(['b', 'e']);
	});

	it('takes collapsed from the first row of a group', () => {
		const groups = group([
			{ field: 'a', group: advanced },
			{ field: 'b', group: { label: 'Advanced' } },
			{ field: 'c', group: tools },
		]);

		expect(groups.map((g) => g.collapsed)).toEqual([true, false]);
	});

	it('sorts non-General groups by order and pins General first', () => {
		const groups = group([
			{ field: 'a', group: { label: 'Late', order: 30 } },
			{ field: 'b', group: { label: 'Early', order: 10 } },
			{ field: 'c' },
			{ field: 'd', group: { label: 'Mid', order: 20 } },
			{ field: 'e', group: { label: 'Mid2', order: 20 } },
		]);

		expect(groups.map((g) => g.label)).toEqual([
			'General',
			'Early',
			'Mid',
			'Mid2',
			'Late',
		]);
	});
});
