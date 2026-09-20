import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/types/langflower-custom-palette.js';
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
				const requestId =
					payload !== null &&
					typeof payload === 'object' &&
					'requestId' in payload &&
					typeof payload.requestId === 'string'
						? payload.requestId
						: undefined;
				snapshots.next({
					nodes: [],
					errors: [],
					status: 'compiling',
					requestId,
				});
				snapshots.next({
					nodes: [{ type: 'fixture-echo' } as never],
					errors: [],
					status: 'ok',
					requestId,
				});
			},
			'customPalette.snapshot': snapshots,
		} as unknown as LangflowerBridge;

		const request = createLangflowerToolsRpc(bridge);
		const result = await request('customPalette.update.requested', {});

		expect(requested).toHaveLength(1);
		expect(requested[0]).toMatchObject({
			type: 'customPalette.update.requested',
			clientId: 'langflower-tools',
		});
		const injected = requested[0] as {
			readonly payload: { readonly requestId: string };
		};
		expect(injected.payload.requestId.length).toBeGreaterThan(0);
		expect(result).toMatchObject({
			status: 'ok',
			requestId: injected.payload.requestId,
		});
	});

	it('ignores a sibling compile snapshot that belongs to another request', async () => {
		const snapshots = new Subject<CustomPaletteSnapshotPayload>();
		let injectedRequestId: string | undefined;
		const bridge = {
			injectInbound: (_type: string, payload: unknown) => {
				if (
					payload !== null &&
					typeof payload === 'object' &&
					'requestId' in payload &&
					typeof payload.requestId === 'string'
				) {
					injectedRequestId = payload.requestId;
				}
			},
			'customPalette.snapshot': snapshots,
		} as unknown as LangflowerBridge;

		const request = createLangflowerToolsRpc(bridge);
		const pending = request('customPalette.update.requested', {});
		await Promise.resolve();

		snapshots.next({
			nodes: [{ type: 'peer-compile' } as never],
			errors: [],
			status: 'ok',
			requestId: 'peer-other',
		});
		snapshots.next({
			nodes: [{ type: 'ours' } as never],
			errors: [],
			status: 'ok',
			requestId: injectedRequestId,
		});

		await expect(pending).resolves.toMatchObject({
			status: 'ok',
			requestId: injectedRequestId,
		});
		expect((await pending).nodes.map((node) => node.type)).toEqual([
			'ours',
		]);
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
