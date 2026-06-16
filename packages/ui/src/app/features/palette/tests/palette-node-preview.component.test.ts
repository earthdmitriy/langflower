import { describe, expect, it } from 'vitest';
import { delayNode } from '../../../../../../common-nodes/src/flow/delay/node.js';
import { hitlReviewGateNode } from '../../../../../../common-nodes/src/hitl/review-gate/node.js';
import { previewNode } from '../../../../../../common-nodes/src/output/preview/node.js';
import { stringNode } from '../../../../../../common-nodes/src/primitives/string/node.js';
import type { PaletteNodeDefinition } from '@langflower/shared/langflower';
import { buildPreviewRowsForTest } from '../components/palette-node-preview.component.js';

function asPaletteNode(node: Record<string, unknown>): PaletteNodeDefinition {
	return { ...node, source: 'system' } as unknown as PaletteNodeDefinition;
}

describe('PaletteNodePreviewComponent rows', () => {
	it('renders string inline field with one output dot', () => {
		const { getInstance: _ignored, ...definition } = stringNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(rows.some((row) => row.rightDot?.portId === 'value')).toBe(true);
		expect(rows.some((row) => row.rightDot?.wireType === 'string')).toBe(
			true,
		);
		expect(rows.some((row) => row.inline === 'text')).toBe(true);
	});

	it('renders preview input without inline editor stub', () => {
		const { getInstance: _ignored, ...definition } = previewNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(rows[0]?.inline).toBe(null);
		expect(rows[0]?.leftDot?.portId).toBe('text');
		expect(rows[0]?.leftDot?.wireType).toBe('string');
		expect(rows[0]?.rightDot?.label).toBe('text');
		expect(rows[0]?.rightDot?.wireType).toBe('from(text)');
	});

	it('renders delay passthrough output as outputName · from(inputName)', () => {
		const { getInstance: _ignored, ...definition } = delayNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));
		const outputRow = rows.find((row) => row.rightDot?.portId === 'value');

		expect(outputRow?.rightDot?.label).toBe('value');
		expect(outputRow?.rightDot?.wireType).toBe('from(value)');
	});

	it('renders review-gate with only the result input (HITL ports hidden)', () => {
		const { getInstance: _ignored, ...definition } = hitlReviewGateNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		const inputRows = rows.filter((row) => row.leftDot !== null);
		const outputIds = rows
			.map((row) => row.rightDot?.portId)
			.filter((portId): portId is string => portId !== undefined)
			.sort();

		expect(inputRows.map((row) => row.leftDot?.portId)).toEqual(['Result']);
		expect(outputIds).toEqual(['feedback', 'preview', 'response']);
	});
});
