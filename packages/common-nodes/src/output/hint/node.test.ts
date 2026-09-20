import { describe, expect, it } from 'vitest';
import { hintNode } from './node.js';

describe('common-hint', () => {
	it('exposes a hidden markdown note and no outputs', () => {
		expect(hintNode.type).toBe('common-hint');
		expect(hintNode.displayName).toBe('Hint');
		expect(hintNode.category).toBe('Output');
		expect(hintNode.defaultCanvasSize).toEqual({
			width: 320,
			height: 280,
		});

		const noteMeta = hintNode.inputsConfigs.find(
			(entry) => entry.portId === 'note',
		);

		expect(noteMeta?.hidden).toBe(true);
		expect(noteMeta?.inline).toBe('markdown');
		expect(noteMeta?.defaultValue).toBe('');
		expect(hintNode.outputsConfigs).toEqual([]);
	});
});
