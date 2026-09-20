import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import type { CustomPaletteSnapshotPayload } from '@langflower/shared/types/langflower-custom-palette.js';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette.js';
import type { LangflowerBridge } from './langflower-bridge.types.js';
import type { ServerContext } from '../server-context.js';
import { LangflowerSession } from '../session/langflower-session.js';
import { compileAndHotSwapCustomNodes } from './compile-and-hot-swap-custom-nodes.js';

describe('compileAndHotSwapCustomNodes', () => {
	it('emits compiling then result snapshot', async () => {
		const snapshots: CustomPaletteSnapshotPayload[] = [];
		const resultSnapshot: CustomPaletteSnapshotPayload = {
			nodes: [{ type: 'fixture-echo' } as PaletteNodeDefinition],
			errors: [],
			status: 'ok',
		};

		const bridge = {
			'customPalette.snapshot': {
				next: (payload: CustomPaletteSnapshotPayload) => {
					snapshots.push(payload);
				},
			},
			'editor.deleteEdges': { next: () => undefined },
			'workflow.currentStatus.snapshot': { next: () => undefined },
		} as unknown as LangflowerBridge;

		const context = {
			projectDir: '/tmp/lf-compile',
			resolveDefinition: () => undefined,
			customPaletteService: {
				compilingSnapshot: () => ({
					nodes: [],
					errors: [],
					status: 'compiling' as const,
				}),
				update: async () => ({
					snapshot: resultSnapshot,
					compiled: true,
				}),
			},
		} as unknown as ServerContext;

		const session = new LangflowerSession();
		const result = await compileAndHotSwapCustomNodes(
			session,
			context,
			bridge,
		);

		expect(snapshots.map((item) => item.status)).toEqual([
			'compiling',
			'ok',
		]);
		expect(result.status).toBe('ok');
		expect(result.nodes.map((node) => node.type)).toEqual(['fixture-echo']);
	});

	it('stamps requestId on compiling and result snapshots', async () => {
		const snapshots: CustomPaletteSnapshotPayload[] = [];
		const resultSnapshot: CustomPaletteSnapshotPayload = {
			nodes: [],
			errors: [],
			status: 'ok',
		};
		const bridge = {
			'customPalette.snapshot': {
				next: (payload: CustomPaletteSnapshotPayload) => {
					snapshots.push(payload);
				},
			},
			'editor.deleteEdges': { next: () => undefined },
			'workflow.currentStatus.snapshot': { next: () => undefined },
		} as unknown as LangflowerBridge;
		const context = {
			projectDir: '/tmp/lf-compile',
			resolveDefinition: () => undefined,
			customPaletteService: {
				compilingSnapshot: () => ({
					nodes: [],
					errors: [],
					status: 'compiling' as const,
				}),
				update: async () => ({
					snapshot: resultSnapshot,
					compiled: true,
				}),
			},
		} as unknown as ServerContext;

		await compileAndHotSwapCustomNodes(
			new LangflowerSession(),
			context,
			bridge,
			{ requestId: 'rpc-1' },
		);

		expect(snapshots.map((item) => item.requestId)).toEqual([
			'rpc-1',
			'rpc-1',
		]);
	});

	it('maps pack errors onto the snapshot', async () => {
		const resultSnapshot: CustomPaletteSnapshotPayload = {
			nodes: [],
			errors: [
				{
					packageName: 'echo-pack',
					message: 'Typecheck failed',
					diagnostics: [],
				},
			],
			status: 'error',
		};

		const bridge = {
			'customPalette.snapshot': new Subject(),
			'editor.deleteEdges': new Subject(),
			'workflow.currentStatus.snapshot': new Subject(),
		} as unknown as LangflowerBridge;

		const context = {
			projectDir: '/tmp/lf-compile',
			resolveDefinition: () => undefined,
			customPaletteService: {
				compilingSnapshot: () => ({
					nodes: [],
					errors: [],
					status: 'compiling' as const,
				}),
				update: async () => ({
					snapshot: resultSnapshot,
					compiled: true,
				}),
			},
		} as unknown as ServerContext;

		const result = await compileAndHotSwapCustomNodes(
			new LangflowerSession(),
			context,
			bridge,
		);

		expect(result.status).toBe('error');
		expect(result.errors).toEqual([
			{
				packageName: 'echo-pack',
				message: 'Typecheck failed',
				diagnostics: [],
			},
		]);
		expect(result.nodes).toEqual([]);
	});
});
