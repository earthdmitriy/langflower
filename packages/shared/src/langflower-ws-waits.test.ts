import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	requestWorkflowList,
	requestWorkflowLoadSnapshot,
	requestWorkflowSaveCurrent,
	startRunner,
	type LangflowerWsClient,
} from './langflower-ws-waits.js';
import type {
	WorkflowCurrentSnapshotPayload,
	WorkflowListSnapshotPayload,
} from './types/langflower-workflow.js';

const exampleRow = {
	workflowId: 'example',
	name: 'Example',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

const savedCurrent = (): WorkflowCurrentSnapshotPayload => ({
	activeWorkflow: {
		workflowId: 'example',
		metadata: {
			name: 'Example',
			createdAt: exampleRow.createdAt,
			updatedAt: exampleRow.updatedAt,
		},
		graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
	},
	currentStatus: { status: 'pristine' },
});

describe('requestThenWait workflow helpers', () => {
	it('requestWorkflowList ignores a catalog that fails the evidence filter', async () => {
		const list = new Subject<WorkflowListSnapshotPayload>();
		const client = {
			'workflow.list.snapshot': list,
			'workflow.list.requested': {
				next: () => {
					list.next({ workflows: [] });
					list.next({ workflows: [exampleRow] });
				},
			},
		} as unknown as LangflowerWsClient;

		const snapshot = await requestWorkflowList(client, (payload) =>
			payload.workflows.some((entry) => entry.workflowId === 'example'),
		);

		expect(snapshot.workflows).toEqual([exampleRow]);
	});

	it('requestWorkflowSaveCurrent waits for pristine active current', async () => {
		const current = new Subject<WorkflowCurrentSnapshotPayload>();
		const client = {
			'workflow.current.snapshot': current,
			'workflow.saveCurrent.requested': {
				next: () => {
					current.next({
						activeWorkflow: savedCurrent().activeWorkflow,
						currentStatus: { status: 'dirty' },
					});
					current.next(savedCurrent());
				},
			},
		} as unknown as LangflowerWsClient;

		const snapshot = await requestWorkflowSaveCurrent(client);
		expect(snapshot.currentStatus.status).toBe('pristine');
	});

	it('startRunner waits for the runId it sent', async () => {
		const started = new Subject<string>();
		const sent: unknown[] = [];
		const client = {
			'runner.started': started,
			'runner.start.requested': {
				next: (payload: unknown) => {
					sent.push(payload);
					const requestedId = (
						payload as readonly [unknown, string]
					)[1];
					started.next('other-run');
					started.next(requestedId);
				},
			},
		} as unknown as LangflowerWsClient;

		const runId = await startRunner(client);
		expect(sent).toHaveLength(1);
		expect((sent[0] as readonly [unknown, string])[1]).toBe(runId);
	});

	it('requestWorkflowLoadSnapshot defaults to the next current snapshot', async () => {
		const current = new Subject<WorkflowCurrentSnapshotPayload>();
		const prior = savedCurrent();
		const client = {
			'workflow.current.snapshot': current,
			'workflow.load.requested': {
				next: () => {
					current.next(prior);
				},
			},
		} as unknown as LangflowerWsClient;

		const snapshot = await requestWorkflowLoadSnapshot(client, {
			workflowId: 'missing',
		});
		expect(snapshot.activeWorkflow?.workflowId).toBe('example');
	});
});
