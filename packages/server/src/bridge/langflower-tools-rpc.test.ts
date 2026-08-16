import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/langflower.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';
import { createLangflowerToolsRpc } from './langflower-tools-rpc.js';

describe('createLangflowerToolsRpc', () => {
	it('injects customPalette.update.requested and returns non-compiling snapshot', async () => {
		const requested: unknown[] = [];
		const snapshots = new Subject<CustomPaletteSnapshotPayload>();
		const bridge = {
			injectInbound: (
				type: string,
				payload: unknown,
				clientId?: string,
			) => {
				requested.push({ type, payload, clientId });
				snapshots.next({
					nodes: [],
					errors: [],
					status: 'compiling',
				});
				snapshots.next({
					nodes: [{ type: 'fixture-echo' } as never],
					errors: [],
					status: 'ok',
				});
			},
			'customPalette.snapshot': snapshots,
		} as unknown as LangflowerBridge;

		const request = createLangflowerToolsRpc(bridge);
		const result = await request('customPalette.update.requested', {});

		expect(requested).toEqual([
			{
				type: 'customPalette.update.requested',
				payload: {},
				clientId: 'langflower-tools',
			},
		]);
		expect(result).toMatchObject({ status: 'ok' });
	});

	it('rejects unknown intents without emitting', async () => {
		let emitted = false;
		const bridge = {
			injectInbound: () => {
				emitted = true;
			},
			'customPalette.snapshot': new Subject(),
		} as unknown as LangflowerBridge;

		const request = createLangflowerToolsRpc(bridge);
		await expect(request('editor.addNode.requested', {})).rejects.toThrow(
			/does not allow intent/,
		);
		expect(emitted).toBe(false);
	});
});
