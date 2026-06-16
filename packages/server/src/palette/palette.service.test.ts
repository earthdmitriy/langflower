import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { getCommonReactiveNode } from '@langflower/common-nodes';
import { describe, expect, it } from 'vitest';
import { PaletteService, toPaletteDefinition } from './palette.service.js';

describe('toPaletteDefinition / PaletteService', () => {
	it('system palette JSON has no Observable junk and stays compact', async () => {
		const service = new PaletteService();
		const { payload } = await service.reload('/unused');
		const json = JSON.stringify(payload);

		expect(json).not.toContain('currentObservers');
		expect(json).not.toContain('"inferTypeFrom"');
		expect(json.length).toBeLessThan(100_000);
	});

	it('strips residual inferTypeFrom from port metas', () => {
		const delay = getCommonReactiveNode('common-delay');
		expect(delay).toBeDefined();

		const withJunk = {
			...delay!,
			outputsConfigs: delay!.outputsConfigs.map((meta) => ({
				...meta,
				inferTypeFrom: { closed: false, currentObservers: null },
			})),
		} as ReactiveNodeDefinition;

		const palette = toPaletteDefinition(withJunk, 'system');
		for (const out of palette.outputsConfigs) {
			expect(out).not.toHaveProperty('inferTypeFrom');
		}
	});
});
