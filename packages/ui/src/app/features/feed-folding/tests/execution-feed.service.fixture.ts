import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import type { NodeId, RunId, RuntimeRunnerEvent } from '@langflower/runtime';
import type {
	CustomPaletteSnapshotPayload,
	ExecutionFeedSnapshotPayload,
	PaletteConfigPayload,
	PaletteNodeDefinition,
	RunnerPermissionAskPayload,
	RunnerPermissionReplyPayload,
	WorkflowCurrentSnapshotPayload,
} from '@langflower/shared/langflower';
import { firstValueFrom, Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { emptyCustomPaletteSnapshot } from '../../palette/types/palette-projection';
import { LangflowerBridgeService } from '../../../services/langflower-bridge.service';
import { ExecutionFeedService } from '../execution-feed.service';
import type { NodeFeedItem, PortStreamItem } from '../types';

export const runId = (value = 'run-1'): RunId => value as RunId;
const nodeId = (value: string): NodeId => value as NodeId;

export const outputEvent = (
	node: string,
	portId: string,
	value: unknown,
	options: {
		readonly run?: string;
		readonly state?: 'pending' | 'value' | 'error';
	} = {},
): Extract<RuntimeRunnerEvent, { kind: 'output-emitted' }> => ({
	kind: 'output-emitted',
	runId: runId(options.run),
	nodeId: nodeId(node),
	portId,
	portIdx: 0,
	edgeIds: [],
	state: options.state ?? 'value',
	value,
});

export const inputEvent = (
	node: string,
	portId: string,
	value: unknown,
	options: {
		readonly run?: string;
		readonly state?: 'pending' | 'value' | 'error';
	} = {},
): Extract<RuntimeRunnerEvent, { kind: 'input-received' }> => ({
	kind: 'input-received',
	runId: runId(options.run),
	nodeId: nodeId(node),
	portId,
	portIdx: 0,
	edgeIds: [],
	state: options.state ?? 'value',
	value,
});

type PortSpec = {
	readonly portId: string;
	readonly direction: 'in' | 'out';
	readonly role?:
		| 'none'
		| 'reasoning'
		| 'draft'
		| 'tool'
		| 'shell'
		| 'result'
		| 'recovery';
	readonly hitl?: boolean;
	readonly streaming?: boolean;
};

export const paletteDefinition = (
	type: string,
	ports: readonly PortSpec[],
): PaletteNodeDefinition =>
	({
		type,
		displayName: type,
		category: 'Test',
		icon: undefined,
		source: 'system',
		uiSchema: [],
		inputsConfigs: ports
			.filter((port) => port.direction === 'in')
			.map((port) => ({
				dir: 'in',
				portId: port.portId,
				wireType: 'any',
				mode: 'single' as const,
				...(port.hitl
					? {
							hitl: {
								kind: 'textarea',
								title: port.portId,
								submitLabel: 'Send',
							},
						}
					: {}),
				...(port.role !== undefined || port.streaming === true
					? {
							feed: {
								...(port.role !== undefined
									? { role: port.role }
									: {}),
								...(port.streaming === true
									? { streaming: true as const }
									: {}),
							},
						}
					: {}),
			})),
		outputsConfigs: ports
			.filter((port) => port.direction === 'out')
			.map((port) => ({
				dir: 'out',
				portId: port.portId,
				wireType: 'any',
				...(port.role !== undefined || port.streaming === true
					? {
							feed: {
								...(port.role !== undefined
									? { role: port.role }
									: {}),
								...(port.streaming === true
									? { streaming: true as const }
									: {}),
							},
						}
					: {}),
			})),
		bypassPorts: {},
		emitOncePerActivation: false,
		stopsRun: false,
		chatEntry: false,
	}) as unknown as PaletteNodeDefinition;

const workflowSnapshot = (
	nodes: Readonly<Record<string, string>>,
): WorkflowCurrentSnapshotPayload => ({
	activeWorkflow: {
		workflowId: 'wf-1',
		metadata: {
			name: 'Fixture',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		},
		graph: {
			nodes: Object.entries(nodes).map(([id, type]) => ({
				id,
				type,
				params: {},
				inputs: {},
				ui: { position: { x: 0, y: 0 }, label: id },
			})),
			edges: [],
			viewport: { x: 0, y: 0, scale: 1 },
		},
	},
	currentStatus: { status: 'pristine' },
});

type ExecutionFeedRaw = {
	readonly executionFeedSnapshot$: Subject<ExecutionFeedSnapshotPayload | null>;
	readonly workflowSnapshot$: Subject<WorkflowCurrentSnapshotPayload>;
	readonly paletteSnapshot$: Subject<PaletteConfigPayload>;
	readonly customPaletteSnapshot$: Subject<CustomPaletteSnapshotPayload>;
	readonly outputEmitted$: Subject<RuntimeRunnerEvent>;
	readonly inputReceived$: Subject<RuntimeRunnerEvent>;
	readonly permissionAsk$: Subject<RunnerPermissionAskPayload>;
	readonly permissionAccepted$: Subject<RunnerPermissionReplyPayload>;
};

export type ExecutionFeedHarness = {
	readonly service: ExecutionFeedService;
	readonly raw: ExecutionFeedRaw;
	readonly latestNodes: () => readonly NodeFeedItem[];
	readonly seedCatalog: (
		nodes: Readonly<Record<string, string>>,
		definitions: readonly PaletteNodeDefinition[],
	) => void;
};

export const createExecutionFeedHarness = (): ExecutionFeedHarness => {
	const raw: ExecutionFeedRaw = {
		executionFeedSnapshot$: new Subject(),
		workflowSnapshot$: new Subject(),
		paletteSnapshot$: new Subject(),
		customPaletteSnapshot$: new Subject(),
		outputEmitted$: new Subject(),
		inputReceived$: new Subject(),
		permissionAsk$: new Subject(),
		permissionAccepted$: new Subject(),
	};
	const bridge = {
		raw: {
			'runner.output-emitted': raw.outputEmitted$,
			'runner.input-received': raw.inputReceived$,
			'runner.permission.ask': raw.permissionAsk$,
			'runner.permission.accepted': raw.permissionAccepted$,
		},
		cached: {
			'executionFeed.snapshot': raw.executionFeedSnapshot$,
			'workflow.current.snapshot': raw.workflowSnapshot$,
			'palette.snapshot': raw.paletteSnapshot$,
			'customPalette.snapshot': raw.customPaletteSnapshot$,
		},
	};
	const injector = Injector.create({
		providers: [
			{ provide: LangflowerBridgeService, useValue: bridge },
			{ provide: DestroyRef, useValue: { onDestroy: () => () => {} } },
		],
	});
	const service = runInInjectionContext(
		injector,
		() => new ExecutionFeedService(),
	);
	let nodes: readonly NodeFeedItem[] = [];
	service.nodeFeed$.subscribe((next) => {
		nodes = next;
	});

	return {
		service,
		raw,
		latestNodes: () => nodes,
		seedCatalog: (workflowNodes, definitions) => {
			raw.customPaletteSnapshot$.next(emptyCustomPaletteSnapshot);
			raw.paletteSnapshot$.next({ nodes: definitions });
			raw.workflowSnapshot$.next(workflowSnapshot(workflowNodes));
		},
	};
};

export const readPorts = async (
	node: NodeFeedItem,
): Promise<
	readonly { readonly segmentId: string; readonly portId: string }[]
> => {
	const ports = await firstValueFrom(
		node.foldedEventsFromPorts.pipe(take(1)),
	);
	return ports.map((port) => ({
		segmentId: port.segmentId,
		portId: port.portId,
	}));
};

export const readItems = async (
	node: NodeFeedItem,
	portId: string,
): Promise<readonly PortStreamItem[]> => {
	const ports = await firstValueFrom(
		node.foldedEventsFromPorts.pipe(take(1)),
	);
	const matching = ports.filter((candidate) => candidate.portId === portId);
	if (matching.length === 0) {
		return [];
	}
	const chunks = await Promise.all(
		matching.map((port) => firstValueFrom(port.stream.pipe(take(1)))),
	);
	return chunks.flat();
};
