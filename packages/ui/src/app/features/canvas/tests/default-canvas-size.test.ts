import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import { describe, expect, it } from 'vitest';
import {
	defaultCanvasSizeForType,
	withDefaultDropSize,
} from '../utils/default-canvas-size.js';

const catalog = (
	type: string,
	defaultCanvasSize?: { readonly width: number; readonly height: number },
): ReadonlyMap<string, PaletteNodeDefinition> =>
	new Map([
		[
			type,
			{
				type,
				displayName: type,
				category: 'Test',
				source: 'custom',
				uiSchema: [],
				inputsConfigs: [],
				outputsConfigs: [],
				...(defaultCanvasSize !== undefined
					? { defaultCanvasSize }
					: {}),
			} as unknown as PaletteNodeDefinition,
		],
	]);

describe('defaultCanvasSizeForType', () => {
	it('reads the box declared by the definition', () => {
		expect(
			defaultCanvasSizeForType(
				'pack/preview',
				catalog('pack/preview', { width: 320, height: 280 }),
			),
		).toEqual({ width: 320, height: 280 });
	});

	it('returns undefined without the declaration or the type', () => {
		expect(
			defaultCanvasSizeForType('pack/plain', catalog('pack/plain')),
		).toBeUndefined();
		expect(
			defaultCanvasSizeForType('pack/absent', new Map()),
		).toBeUndefined();
	});
});

describe('withDefaultDropSize', () => {
	it('seeds the declared box on the drop payload', () => {
		expect(
			withDefaultDropSize(
				'pack/preview',
				{ x: 10, y: 20 },
				catalog('pack/preview', { width: 320, height: 280 }),
			),
		).toEqual({ x: 10, y: 20, width: 320, height: 280 });
	});

	it('leaves size unset when the definition declares none', () => {
		expect(
			withDefaultDropSize(
				'pack/plain',
				{ x: 10, y: 20 },
				catalog('pack/plain'),
			),
		).toEqual({ x: 10, y: 20 });
	});
});
