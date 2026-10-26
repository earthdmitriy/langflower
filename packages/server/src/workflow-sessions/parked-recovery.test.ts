import type { ReactiveNodeDefinition } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import type { LangflowerSession } from '../session/langflower-session.js';
import { planParkedRecovery } from './parked-recovery.js';

const chatEntry = {
	chatEntry: true,
	inputsConfigs: [
		{
			portId: 'message',
			hitl: { kind: 'textarea', title: 'Message', role: 'chat-start' },
		},
	],
} as unknown as ReactiveNodeDefinition;

const gate = {
	inputsConfigs: [
		{ portId: 'result' },
		{
			portId: 'requestChanges',
			hitl: { kind: 'textarea', title: 'Request changes' },
		},
	],
} as unknown as ReactiveNodeDefinition;

const definitions: Record<string, ReactiveNodeDefinition> = {
	'common-chat-input': chatEntry,
	'common-hitl-review-gate': gate,
};

const resolve = (node: { readonly type: string }) => definitions[node.type];

const turn = { text: 'draft something', files: [] };

const log = [
	['in', 'chat', 'message', { value: 'old' }, 0, [], null],
	['in', 'chat', 'message', { value: turn }, 0, [], null],
	['in', 'ask', 'result', { value: 'first draft' }, 0, [], null],
];

const session = (
	overrides: Record<string, unknown> = {},
	events: readonly unknown[] = log,
): LangflowerSession =>
	({
		binding: { kind: 'workflowSession', sessionId: 's1' },
		boundFeedSnapshot: {
			runId: 'run-1',
			workflowId: 'w',
			status: 'running',
			events,
		},
		activeWorkflow: {
			workflowId: 'w',
			metadata: {},
			graph: {
				nodes: [
					{ id: 'chat', type: 'common-chat-input', params: {} },
					{ id: 'ask', type: 'common-hitl-review-gate', params: {} },
				],
				edges: [],
			},
		},
		...overrides,
	}) as unknown as LangflowerSession;

describe('planParkedRecovery', () => {
	it('keeps the run id and log and seeds each chat entry silently from the log', () => {
		const plan = planParkedRecovery(session(), resolve, 'ask');

		expect(plan?.runId).toBe('run-1');
		expect(plan?.events).toHaveLength(3);
		expect(plan?.seeds).toEqual({
			chat: [
				{ portId: 'message', slotIndex: 0, value: turn, silent: true },
			],
		});
	});

	it('is not a recovery for a chat entry, an unbound session, or no restored log', () => {
		expect(planParkedRecovery(session(), resolve, 'chat')).toBeUndefined();
		expect(
			planParkedRecovery(
				session({ binding: { kind: 'workflow' } }),
				resolve,
				'ask',
			),
		).toBeUndefined();
		expect(
			planParkedRecovery(
				session({ boundFeedSnapshot: null }),
				resolve,
				'ask',
			),
		).toBeUndefined();
	});

	it('is not a recovery when the log shows the gate was answered', () => {
		const answered = [
			...log,
			['in', 'ask', 'requestChanges', { value: 'shorter' }, 0, [], null],
		];
		expect(
			planParkedRecovery(session({}, answered), resolve, 'ask'),
		).toBeUndefined();
	});

	it('is a recovery again when a new result arrives after a reply', () => {
		const loop = [
			...log,
			['in', 'ask', 'requestChanges', { value: 'shorter' }, 0, [], null],
			['in', 'ask', 'result', { value: 'second draft' }, 0, [], null],
		];
		expect(
			planParkedRecovery(session({}, loop), resolve, 'ask')?.runId,
		).toBe('run-1');
	});

	it('is not a recovery for a node the log never shows waiting', () => {
		expect(
			planParkedRecovery(session({}, [log[0]]), resolve, 'ask'),
		).toBeUndefined();
	});
});
