import type { NodeId, PortTelemetry, RunId } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import type { WorkflowCurrentSnapshotPayload } from '@langflower/shared/types/langflower-workflow';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { emptyCustomPaletteSnapshot } from '../../../services/execution-catalog';
import { foldSingleNodeHitlAwaiting } from '../fold-canvas-node-hitl';
import type { CanvasNodeStatusBridgeSources } from '../types';

const runId = 'r1' as RunId;
const nodeId = 'n1' as NodeId;

const agentDef = {
	type: 'agent',
	displayName: 'Agent',
	category: 'llm',
	source: 'system',
	uiSchema: [],
	inputsConfigs: [
		{ dir: 'in', portId: 'prompt', wireType: 'string' },
		{
			dir: 'in',
			portId: 'reply',
			wireType: 'string',
			hitl: { kind: 'text' },
		},
	],
	outputsConfigs: [],
	bypassPorts: {},
	emitOncePerActivation: false,
	stopsRun: false,
	chatEntry: false,
} as unknown as PaletteNodeDefinition;

const promptIn = (value: string): PortTelemetry => [
	'in',
	nodeId,
	'prompt',
	{ value },
	0,
	[],
	null,
];

const workflowSnapshot = (): WorkflowCurrentSnapshotPayload => ({
	activeWorkflow: {
		workflowId: 'wf-1',
		metadata: {
			name: 'wf',
			createdAt: '0',
			updatedAt: '0',
		},
		graph: {
			nodes: [
				{
					id: nodeId,
					type: 'agent',
					params: {},
					inputs: {},
					ui: { position: { x: 0, y: 0 } },
				},
			],
			edges: [],
			viewport: { x: 0, y: 0, scale: 1 },
		},
	},
	currentStatus: { status: 'pristine' },
});

const hitlFeedSnapshot = (): ExecutionFeedSnapshotPayload => ({
	runId,
	workflowId: 'wf-1',
	status: 'running',
	events: [promptIn('hi')],
});

const createSources = (): {
	readonly sources: Pick<
		CanvasNodeStatusBridgeSources,
		| 'executionFeedSnapshot$'
		| 'runnerPort$'
		| 'runnerStarted$'
		| 'runnerStartNodeStarted$'
		| 'workflowSnapshot$'
		| 'paletteSnapshot$'
		| 'customPaletteSnapshot$'
	>;
	readonly executionFeedSnapshot$: Subject<ExecutionFeedSnapshotPayload | null>;
	readonly workflowSnapshot$: Subject<WorkflowCurrentSnapshotPayload>;
	readonly paletteSnapshot$: Subject<{
		readonly nodes: readonly PaletteNodeDefinition[];
	}>;
	readonly customPaletteSnapshot$: Subject<typeof emptyCustomPaletteSnapshot>;
} => {
	const executionFeedSnapshot$ =
		new Subject<ExecutionFeedSnapshotPayload | null>();
	const runnerPort$ = new Subject<PortTelemetry>();
	const runnerStarted$ = new Subject<RunId>();
	const runnerStartNodeStarted$ = new Subject<RunId>();
	const workflowSnapshot$ = new Subject<WorkflowCurrentSnapshotPayload>();
	const paletteSnapshot$ = new Subject<{
		readonly nodes: readonly PaletteNodeDefinition[];
	}>();
	const customPaletteSnapshot$ = new Subject<
		typeof emptyCustomPaletteSnapshot
	>();
	return {
		executionFeedSnapshot$,
		workflowSnapshot$,
		paletteSnapshot$,
		customPaletteSnapshot$,
		sources: {
			executionFeedSnapshot$,
			runnerPort$,
			runnerStarted$,
			runnerStartNodeStarted$,
			workflowSnapshot$,
			paletteSnapshot$,
			customPaletteSnapshot$,
		},
	};
};

const emitCatalog = (harness: ReturnType<typeof createSources>): void => {
	harness.workflowSnapshot$.next(workflowSnapshot());
	harness.paletteSnapshot$.next({ nodes: [agentDef] });
	harness.customPaletteSnapshot$.next(emptyCustomPaletteSnapshot);
};

describe('foldSingleNodeHitlAwaiting', () => {
	it('rebuilds awaiting when feed snapshot arrives before palette', () => {
		const harness = createSources();
		const seen: boolean[] = [];
		const sub = foldSingleNodeHitlAwaiting(
			nodeId,
			harness.sources,
		).subscribe((awaiting) => {
			seen.push(awaiting);
		});

		harness.executionFeedSnapshot$.next(hitlFeedSnapshot());
		expect(seen.at(-1)).toBe(false);

		emitCatalog(harness);
		expect(seen.at(-1)).toBe(true);

		sub.unsubscribe();
	});

	it('stays idle when the first catalog has no stored events', () => {
		const harness = createSources();
		const seen: boolean[] = [];
		const sub = foldSingleNodeHitlAwaiting(
			nodeId,
			harness.sources,
		).subscribe((awaiting) => {
			seen.push(awaiting);
		});

		emitCatalog(harness);
		expect(seen.at(-1)).toBe(false);

		sub.unsubscribe();
	});
});
