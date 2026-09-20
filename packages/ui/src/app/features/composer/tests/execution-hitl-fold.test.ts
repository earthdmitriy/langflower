import type { NodeId, PortTelemetry, RunId } from '@langflower/runtime';
import type { ExecutionFeedSnapshotPayload } from '@langflower/shared/types/langflower-bootstrap';
import type { PaletteNodeDefinition } from '@langflower/shared/types/langflower-palette';
import type { WorkflowCurrentSnapshotPayload } from '@langflower/shared/types/langflower-workflow';
import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type {
	InputPortTelemetry,
	OutputPortTelemetry,
} from '../../../services/execution-chrome-fold';
import { createHitlTriggeredNodes$ } from '../execution-hitl-fold';

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

describe('createHitlTriggeredNodes$', () => {
	it('does not restore awaiting ids from a settled feed when palette re-emits', () => {
		const workflowSnapshot$ = new Subject<WorkflowCurrentSnapshotPayload>();
		const paletteSnapshot$ = new Subject<{
			readonly nodes: readonly PaletteNodeDefinition[];
		}>();
		const executionFeedSnapshot$ =
			new Subject<ExecutionFeedSnapshotPayload | null>();
		const inputReceived$ = new Subject<InputPortTelemetry>();
		const outputEmitted$ = new Subject<OutputPortTelemetry>();
		const runnerStarted$ = new Subject<RunId>();
		const runnerStartNodeStarted$ = new Subject<RunId>();
		const runnerDone$ = new Subject<unknown>();
		const runnerInterrupted$ = new Subject<unknown>();
		const hitlOpenLocal$ = new Subject<string>();
		const hitlResolveLocal$ = new Subject<string>();
		const ids: ReadonlySet<string>[] = [];

		const subscription = createHitlTriggeredNodes$({
			workflowSnapshot$,
			paletteSnapshot$,
			executionFeedSnapshot$,
			inputReceived$,
			outputEmitted$,
			runnerStarted$,
			runnerStartNodeStarted$,
			runnerDone$,
			runnerInterrupted$,
			hitlOpenLocal$,
			hitlResolveLocal$,
		}).subscribe((value) => {
			ids.push(value);
		});

		const workflow = workflowSnapshot();
		const palette = { nodes: [agentDef] };
		const feed = hitlFeedSnapshot();

		workflowSnapshot$.next(workflow);
		paletteSnapshot$.next(palette);
		executionFeedSnapshot$.next(feed);

		expect([...ids.at(-1)!]).toEqual([nodeId]);

		runnerDone$.next(undefined);
		expect([...ids.at(-1)!]).toEqual([]);

		paletteSnapshot$.next({ nodes: [agentDef] });
		expect([...ids.at(-1)!]).toEqual([]);

		subscription.unsubscribe();
	});
});
