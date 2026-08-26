import { describe, expect, it } from 'vitest';
import type { WorkflowPersistedGraph } from '@langflower/shared/langflower';
import { nodeInputString } from '../node-input-string.js';

const graphWithMessage = (message: string): WorkflowPersistedGraph => ({
	viewport: { x: 0, y: 0, scale: 1 },
	nodes: [
		{
			id: 'chat',
			type: 'common-chat-input',
			params: {},
			inputs: { message },
			ui: { position: { x: 0, y: 0 } },
		},
	],
	edges: [],
});

describe('nodeInputString', () => {
	it('returns persisted inputs.message', () => {
		expect(
			nodeInputString(
				graphWithMessage('saved prompt'),
				'chat',
				'message',
			),
		).toBe('saved prompt');
	});

	it('returns empty when nothing is stored', () => {
		expect(nodeInputString(null, 'chat', 'message')).toBe('');
		expect(
			nodeInputString(graphWithMessage(''), 'missing', 'message'),
		).toBe('');
	});
});
