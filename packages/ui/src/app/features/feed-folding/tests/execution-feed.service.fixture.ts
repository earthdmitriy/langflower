import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import type {
	EdgeId,
	NodeId,
	PortTelemetry,
	RunId,
	RuntimeFeedPortMeta,
	RuntimeRunnerEvent,
} from '@langflower/runtime';
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

const buildPortTelemetry = (
	portDir: 'in' | 'out',
	node: string,
	portId: string,
	value: unknown,
	options: {
		readonly state?: 'pending' | 'value' | 'error' | 'inactive';
		readonly portIdx?: number;
		readonly edgeIds?: readonly EdgeId[];
		readonly feed?: RuntimeFeedPortMeta;
	} = {},
): PortTelemetry => {
	const state = options.state ?? 'value';
	const response =
		state === 'pending'
			? { pending: true as const }
			: state === 'inactive'
				? { inactive: true as const }
				: state === 'error'
					? { error: value }
					: { value };
	return [
		portDir,
		nodeId(node),
		portId,
		response,
		options.portIdx ?? 0,
		options.edgeIds ?? [],
		options.feed ?? null,
	];
};

export const outputEvent = (
	node: string,
	portId: string,
	value: unknown,
	options: {
		readonly state?: 'pending' | 'value' | 'error';
		readonly edgeIds?: readonly EdgeId[];
		readonly feed?: RuntimeFeedPortMeta;
	} = {},
): PortTelemetry & { readonly 0: 'out' } =>
	buildPortTelemetry('out', node, portId, value, options) as PortTelemetry & {
		readonly 0: 'out';
	};

export const inputEvent = (
	node: string,
	portId: string,
	value: unknown,
	options: {
		readonly state?: 'pending' | 'value' | 'error';
		readonly edgeIds?: readonly EdgeId[];
		readonly feed?: RuntimeFeedPortMeta;
	} = {},
): PortTelemetry & { readonly 0: 'in' } =>
	buildPortTelemetry('in', node, portId, value, options) as PortTelemetry & {
		readonly 0: 'in';
	};

type PortSpec = {
	readonly portId: string;
	readonly direction: 'in' | 'out';
	readonly role?:
		| 'none'
		| 'reasoning'
		| 'progress'
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
	workflowId = 'wf-1',
): WorkflowCurrentSnapshotPayload => ({
	activeWorkflow: {
		workflowId,
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
	readonly runnerPort$: Subject<RuntimeRunnerEvent>;
	readonly runnerStarted$: Subject<RunId>;
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
		options?: {
			readonly startRun?: boolean | RunId;
			readonly workflowId?: string;
		},
	) => void;
};

export const startRun = (
	harness: ExecutionFeedHarness,
	id: RunId | string = 'run-1',
): void => {
	harness.raw.runnerStarted$.next(runId(id));
};

export const createExecutionFeedHarness = (): ExecutionFeedHarness => {
	const runnerPort$ = new Subject<RuntimeRunnerEvent>();
	const runnerStarted$ = new Subject<RunId>();
	const raw: ExecutionFeedRaw = {
		executionFeedSnapshot$: new Subject(),
		workflowSnapshot$: new Subject(),
		paletteSnapshot$: new Subject(),
		customPaletteSnapshot$: new Subject(),
		runnerPort$,
		runnerStarted$,
		permissionAsk$: new Subject(),
		permissionAccepted$: new Subject(),
	};
	const bridge = {
		raw: {
			'runner.port': runnerPort$,
			'runner.started': runnerStarted$,
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
		seedCatalog: (workflowNodes, definitions, options) => {
			raw.customPaletteSnapshot$.next(emptyCustomPaletteSnapshot);
			raw.paletteSnapshot$.next({ nodes: definitions });
			raw.workflowSnapshot$.next(
				workflowSnapshot(workflowNodes, options?.workflowId),
			);
			if (options?.startRun !== false) {
				const id =
					typeof options?.startRun === 'string'
						? options.startRun
						: 'run-1';
				runnerStarted$.next(runId(id));
			}
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
