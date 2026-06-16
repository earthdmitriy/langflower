import { describe, expect, it } from 'vitest';
import {
	resolveResumeFailedPredicate,
	resolveWaitPredicate,
} from './intent-wait-predicate.js';

describe('resolveWaitPredicate', () => {
	it('correlates workflow.load to active workflow id', () => {
		const predicate = resolveWaitPredicate('workflow.load.requested', {
			workflowId: 'demo',
		});
		expect(predicate).toBeTypeOf('function');
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'demo',
					metadata: { name: 'Demo' },
				},
				currentStatus: { status: 'pristine' },
			}),
		).toBe(true);
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'other',
					metadata: { name: 'Other' },
				},
				currentStatus: { status: 'pristine' },
			}),
		).toBe(false);
	});

	it('correlates workflow.delete to list without id', () => {
		const predicate = resolveWaitPredicate('workflow.delete.requested', {
			workflowId: 'gone',
		});
		expect(
			predicate!({
				workflows: [{ workflowId: 'keep', name: 'Keep' }],
			}),
		).toBe(true);
		expect(
			predicate!({
				workflows: [{ workflowId: 'gone', name: 'Gone' }],
			}),
		).toBe(false);
	});

	it('correlates workflow.copy to -copy active id', () => {
		const predicate = resolveWaitPredicate('workflow.copy.requested', {
			workflowId: 'demo',
		});
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'demo-copy',
					metadata: { name: 'Demo copy' },
				},
			}),
		).toBe(true);
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'demo-copy-2',
					metadata: { name: 'Demo copy' },
				},
			}),
		).toBe(true);
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'demo',
					metadata: { name: 'Demo' },
				},
			}),
		).toBe(false);
	});

	it('correlates rename to trimmed name', () => {
		const predicate = resolveWaitPredicate(
			'workflow.renameCurrent.requested',
			{ name: '  Renamed  ' },
		);
		expect(
			predicate!({
				activeWorkflow: {
					workflowId: 'renamed',
					metadata: { name: 'Renamed' },
				},
			}),
		).toBe(true);
	});

	it('correlates runner.start only when runId is supplied', () => {
		expect(
			resolveWaitPredicate('runner.start.requested', [{}]),
		).toBeUndefined();
		const withRunId = resolveWaitPredicate('runner.start.requested', [
			{},
			'run-1',
		]);
		expect(withRunId).toBeTypeOf('function');
		expect(withRunId!('run-1')).toBe(true);
		expect(withRunId!('run-2')).toBe(false);
	});

	it('correlates runner.startNode runId at tuple index 2', () => {
		const predicate = resolveWaitPredicate('runner.startNode.requested', [
			'node-a',
			{},
			'run-n',
		]);
		expect(predicate!('run-n')).toBe(true);
		expect(predicate!('run-x')).toBe(false);
	});

	it('correlates hitl input-received by nodeId/portId', () => {
		const predicate = resolveWaitPredicate('runner.hitl.event', {
			nodeId: 'n1',
			portId: 'message',
			payload: 'hi',
		});
		expect(
			predicate!({
				kind: 'input-received',
				nodeId: 'n1',
				portId: 'message',
				runId: 'r1',
			}),
		).toBe(true);
		expect(
			predicate!({
				kind: 'input-received',
				nodeId: 'n2',
				portId: 'message',
				runId: 'r1',
			}),
		).toBe(false);
	});

	it('correlates execution feed clear to empty/null', () => {
		const predicate = resolveWaitPredicate(
			'runner.executionFeed.clear.requested',
			{},
		);
		expect(predicate!(null)).toBe(true);
		expect(predicate!({ events: [] })).toBe(true);
		expect(predicate!({ events: [{ kind: 'done' }] })).toBe(false);
	});

	it('correlates checkpoint discard to missing runId', () => {
		const predicate = resolveWaitPredicate(
			'runner.checkpoint.discard.requested',
			{ runId: 'r1' },
		);
		expect(predicate!({ workflowId: 'w', checkpoints: [] })).toBe(true);
		expect(
			predicate!({
				workflowId: 'w',
				checkpoints: [{ runId: 'r1' }],
			}),
		).toBe(false);
	});

	it('leaves uncorrelated intents as next-broadcast-wins', () => {
		expect(
			resolveWaitPredicate('workflow.list.requested', {}),
		).toBeUndefined();
		expect(
			resolveWaitPredicate('workflow.saveCurrent.requested', {}),
		).toBeUndefined();
		expect(
			resolveWaitPredicate('workflow.create.requested', {}),
		).toBeUndefined();
		expect(
			resolveWaitPredicate('runner.interrupt.requested', 'cancel'),
		).toBeUndefined();
	});
});

describe('resolveResumeFailedPredicate', () => {
	it('matches failed frames for the requested runId', () => {
		const predicate = resolveResumeFailedPredicate({ runId: 'r1' });
		expect(
			predicate!({ code: 'NOT_FOUND', message: 'x', runId: 'r1' }),
		).toBe(true);
		expect(predicate!({ code: 'BUSY', message: 'x' })).toBe(true);
		expect(
			predicate!({ code: 'NOT_FOUND', message: 'x', runId: 'r2' }),
		).toBe(false);
	});
});
