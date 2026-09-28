import { describe, expect, it } from 'vitest';
import { delayNode } from '../../../../../../common-nodes/src/flow/delay/node.js';
import { hitlReviewGateNode } from '../../../../../../common-nodes/src/hitl/review-gate/node.js';
import { chatInputNode } from '../../../../../../common-nodes/src/hitl/chat-input/node.js';
import { hintNode } from '../../../../../../common-nodes/src/output/hint/node.js';
import { previewNode } from '../../../../../../common-nodes/src/output/preview/node.js';
import { stringNode } from '../../../../../../common-nodes/src/primitives/string/node.js';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import { fromOutputPortId } from '../../../diagram/diagram-port-id.js';
import { buildPreviewRowsForTest } from '../components/palette-node-preview.component.js';

const asPaletteNode = (node: Record<string, unknown>): PaletteNodeDefinition =>
	({ ...node, source: 'system' }) as unknown as PaletteNodeDefinition;

const outputIds = (rows: ReturnType<typeof buildPreviewRowsForTest>) =>
	rows
		.map((row) => {
			if (row.output === null) {
				return undefined;
			}

			return fromOutputPortId(row.output.portId);
		})
		.filter((portId): portId is string => portId !== undefined);

describe('PaletteNodePreviewComponent rows', () => {
	it('renders string inline field with one output', () => {
		const { getInstance: _ignored, ...definition } = stringNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(outputIds(rows)).toContain('value');
		expect(rows.some((row) => row.output?.wireType === 'string')).toBe(
			true,
		);
		expect(rows.some((row) => row.inline === 'text')).toBe(true);
	});

	it('renders preview input without inline editor stub', () => {
		const { getInstance: _ignored, ...definition } = previewNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(rows[0]?.inline).toBe(null);
		expect(rows[0]?.input?.label).toBe('input');
		expect(rows[0]?.input?.wireType).toBe('dynamic');
		expect(rows[0]?.output?.label).toBe('output');
		expect(rows[0]?.output?.wireType).toBe('from(input)');
		expect(rows[1]?.input).toBeNull();
		expect(rows[1]?.output?.label).toBe('text');
		expect(rows[1]?.output?.wireType).toBe('string');
	});

	it('renders delay passthrough output as outputName · from(inputName)', () => {
		const { getInstance: _ignored, ...definition } = delayNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));
		const outputRow = rows.find(
			(row) =>
				row.output !== null &&
				fromOutputPortId(row.output.portId) === 'value',
		);

		expect(outputRow?.output?.label).toBe('value');
		expect(outputRow?.output?.wireType).toBe('from(value)');
	});

	it('renders review-gate with only the result input (HITL ports hidden)', () => {
		const { getInstance: _ignored, ...definition } = hitlReviewGateNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		const inputLabels = rows
			.map((row) => row.input?.label)
			.filter((label): label is string => label !== undefined);

		expect(inputLabels).toEqual(['result']);
		expect(outputIds(rows).sort()).toEqual(['feedback', 'response']);
	});

	it('renders Chat Input multiline without an incoming port chrome', () => {
		const { getInstance: _ignored, ...definition } = chatInputNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(rows.some((row) => row.inline === 'text-multiline')).toBe(true);
		expect(rows.some((row) => row.input !== null)).toBe(false);
		expect(outputIds(rows)).toContain('message');
	});

	it('renders Hint markdown without port chrome', () => {
		const { getInstance: _ignored, ...definition } = hintNode;
		const rows = buildPreviewRowsForTest(asPaletteNode(definition));

		expect(rows.some((row) => row.inline === 'markdown')).toBe(true);
		expect(rows.some((row) => row.input !== null)).toBe(false);
		expect(outputIds(rows)).toEqual([]);
	});
});
