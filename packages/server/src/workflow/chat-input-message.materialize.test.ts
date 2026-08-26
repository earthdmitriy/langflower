import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { firstValueFrom, timeout } from 'rxjs';
import { LangflowerSession } from '../session/langflower-session.js';
import { bindWorkflowToSessionEditor } from './apply-editor-mutation.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

const resolveDefinition: ResolveNodeDefinition = (node) =>
	resolveWorkflowNodeDefinition({ type: node.type });

describe('materialize Chat Input persisted message', () => {
	it('leaves the HITL message port inactive so Start can pushIntoInput once', async () => {
		const session = new LangflowerSession();
		const bind = bindWorkflowToSessionEditor(
			session.runtime.editor,
			process.cwd(),
			{
				workflowId: 'chat-input-message',
				metadata: {
					name: 'chat-input-message',
					createdAt: '2026-07-23T00:00:00.000Z',
					updatedAt: '2026-07-23T00:00:00.000Z',
				},
				graph: {
					viewport: { x: 0, y: 0, scale: 1 },
					nodes: [
						{
							id: 'chat-1',
							type: 'common-chat-input',
							params: {},
							inputs: { message: 'saved prompt' },
							ui: { position: { x: 0, y: 0 } },
						},
					],
					edges: [],
				},
			},
			resolveDefinition,
		);
		expect(bind.ok).toBe(true);

		const chat = session.runtime.editor.getNode('chat-1' as NodeId);
		expect(chat).not.toBe(false);
		if (chat === false) {
			return;
		}

		const message = chat.inputs['message'];
		expect(message).toBeDefined();
		if (message === undefined) {
			return;
		}

		await expect(
			firstValueFrom(message.value$.pipe(timeout({ first: 80 }))),
		).rejects.toThrow();
	});
});
