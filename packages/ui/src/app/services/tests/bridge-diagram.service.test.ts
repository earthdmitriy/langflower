import type { WorkflowNodePersisted } from '@langflower/shared/langflower';
import { describe, expect, it } from 'vitest';
import { persistedNodeToDiagram } from '../bridge-diagram.service.js';
import { previewNodeDefaultSize } from '../../features/canvas/utils/preview-node-default-size.js';

const baseNode = (
	position: {
		readonly x?: number;
		readonly y?: number;
		readonly width?: number;
		readonly height?: number;
	} = {},
): WorkflowNodePersisted => ({
	id: 'n1',
	type: 'common-string',
	params: {},
	inputs: {},
	ui: {
		position: {
			x: position.x ?? 0,
			y: position.y ?? 0,
			...(position.width !== undefined ? { width: position.width } : {}),
			...(position.height !== undefined
				? { height: position.height }
				: {}),
		},
	},
});

describe('persistedNodeToDiagram sizing', () => {
	it('keeps autoSize true when width is unset (mode A)', () => {
		const diagram = persistedNodeToDiagram(baseNode(), new Map());

		expect(diagram.autoSize).toBe(true);
		expect(diagram.size).toBeUndefined();
		expect(diagram.resizable).toBe(true);
	});

	it('does not invent width from height-only persistence', () => {
		const diagram = persistedNodeToDiagram(
			baseNode({ height: 120 }),
			new Map(),
		);

		expect(diagram.autoSize).toBe(true);
		expect(diagram.size).toBeUndefined();
	});

	it('locks width and disables autoSize when width is set (mode B)', () => {
		const diagram = persistedNodeToDiagram(
			baseNode({ width: 220, height: 100 }),
			new Map(),
		);

		expect(diagram.autoSize).toBe(false);
		expect(diagram.size).toEqual({ width: 220, height: 100 });
		expect(diagram.resizable).toBe(true);
	});

	it('defaults height when only width is persisted', () => {
		const diagram = persistedNodeToDiagram(
			baseNode({ width: 200 }),
			new Map(),
		);

		expect(diagram.autoSize).toBe(false);
		expect(diagram.size).toEqual({ width: 200, height: 72 });
	});

	it('locks common-preview to 320×280 when width is unset', () => {
		const diagram = persistedNodeToDiagram(
			{ ...baseNode(), type: 'common-preview' },
			new Map(),
		);

		expect(diagram.autoSize).toBe(false);
		expect(diagram.size).toEqual(previewNodeDefaultSize);
	});

	it('keeps a persisted Preview size over the default', () => {
		const diagram = persistedNodeToDiagram(
			{
				...baseNode({ width: 400, height: 200 }),
				type: 'common-preview',
			},
			new Map(),
		);

		expect(diagram.autoSize).toBe(false);
		expect(diagram.size).toEqual({ width: 400, height: 200 });
	});
});
