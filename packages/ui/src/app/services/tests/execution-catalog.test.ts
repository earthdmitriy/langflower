import type { CustomPaletteSnapshotPayload } from '@langflower/shared/types/langflower-custom-palette';
import type {
	PaletteConfigPayload,
	PaletteNodeDefinition,
} from '@langflower/shared/types/langflower-palette';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	emptyCustomPaletteSnapshot,
	mergedPaletteFromSnapshots$,
	nodeTypeByIdFromWorkflow,
} from '../execution-catalog';

const systemNode = {
	type: 'common-string',
	displayName: 'String',
	category: 'primitives',
	source: 'system',
	uiSchema: [],
	inputsConfigs: [],
	outputsConfigs: [],
	bypassPorts: {},
	emitOncePerActivation: true,
	stopsRun: false,
	chatEntry: false,
} as unknown as PaletteNodeDefinition;

const customChat = {
	type: 'pack-chat',
	displayName: 'Pack Chat',
	category: 'hitl',
	source: 'custom',
	uiSchema: [],
	inputsConfigs: [],
	outputsConfigs: [],
	bypassPorts: {},
	emitOncePerActivation: false,
	stopsRun: false,
	chatEntry: true,
} as unknown as PaletteNodeDefinition;

const systemSnap = (): PaletteConfigPayload => ({ nodes: [systemNode] });

const customSnap = (): CustomPaletteSnapshotPayload => ({
	nodes: [customChat],
	errors: [],
	status: 'ok',
});

describe('mergedPaletteFromSnapshots$', () => {
	it('does not emit until both system and custom snapshots arrive', () => {
		const system$ = new Subject<PaletteConfigPayload>();
		const custom$ = new Subject<CustomPaletteSnapshotPayload>();
		const types: string[][] = [];
		const sub = mergedPaletteFromSnapshots$(system$, custom$).subscribe(
			(snap) => {
				types.push(snap.nodes.map((node) => node.type));
			},
		);

		system$.next(systemSnap());
		expect(types).toEqual([]);

		custom$.next(customSnap());
		expect(types).toEqual([['common-string', 'pack-chat']]);

		sub.unsubscribe();
	});

	it('includes custom chatEntry only after the real custom snapshot', () => {
		const system$ = new Subject<PaletteConfigPayload>();
		const custom$ = new Subject<CustomPaletteSnapshotPayload>();
		const chatEntryTypes: string[][] = [];
		const sub = mergedPaletteFromSnapshots$(system$, custom$).subscribe(
			(snap) => {
				chatEntryTypes.push(
					snap.nodes
						.filter((node) => node.chatEntry === true)
						.map((node) => node.type),
				);
			},
		);

		system$.next(systemSnap());
		custom$.next(emptyCustomPaletteSnapshot);
		expect(chatEntryTypes).toEqual([[]]);

		custom$.next(customSnap());
		expect(chatEntryTypes).toEqual([[], ['pack-chat']]);

		sub.unsubscribe();
	});
});

describe('nodeTypeByIdFromWorkflow', () => {
	it('returns an empty map when no workflow is loaded', () => {
		const empty = nodeTypeByIdFromWorkflow({
			activeWorkflow: null,
			currentStatus: { status: 'pristine' },
		});
		expect(empty.size).toBe(0);
	});

	it('indexes node types from the active graph', () => {
		const mapped = nodeTypeByIdFromWorkflow({
			activeWorkflow: {
				workflowId: 'wf',
				metadata: {
					name: 'wf',
					createdAt: '0',
					updatedAt: '0',
				},
				graph: {
					viewport: { x: 0, y: 0, scale: 1 },
					nodes: [
						{
							id: 'n1',
							type: 'common-string',
							params: {},
							inputs: {},
							ui: { position: { x: 0, y: 0 } },
						},
					],
					edges: [],
				},
			},
			currentStatus: { status: 'pristine' },
		});
		expect(mapped.get('n1')).toBe('common-string');
		expect(mapped.size).toBe(1);
	});
});
