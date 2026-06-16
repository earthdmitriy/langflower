import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createRuntimeHarness } from '../workflows/workflow-events.js';
import { createConstantTestNode } from './constant-node.js';
import { createHitlTestNode } from './hitl-node.js';

describe('createHitlTestNode', () => {
	it('exposes submitReply ref', async () => {
		const hitl = createHitlTestNode({ nodeId: 'ask' });
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({
				nodeId: 'q',
				value: 'Your name?',
			}),
		);
		runtime.editor.addNode(hitl.node);
		runtime.editor.addEdge({
			fromNodeId: 'q',
			fromPort: ['value', 0],
			toNodeId: 'ask',
			toPort: ['question', 0],
		});

		runtime.runner.start();

		expect(
			await readOutputValue(runtime.editor.getNode('ask').outputs.prompt),
		).toEqual({ question: 'Your name?', awaiting: true });

		hitl.submitReply('Alice');

		expect(
			await readOutputValue(runtime.editor.getNode('ask').outputs.reply),
		).toBe('Alice');
	});

	it('emits reply on runtime events$', async () => {
		const hitl = createHitlTestNode({ nodeId: 'ask' });
		const runtime = createRuntimeHarness();
		runtime.editor.addNode(
			createConstantTestNode({ nodeId: 'q', value: 'Approve?' }),
		);
		runtime.editor.addNode(hitl.node);
		runtime.editor.addEdge({
			fromNodeId: 'q',
			fromPort: ['value', 0],
			toNodeId: 'ask',
			toPort: ['question', 0],
		});

		const replyPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event.kind === 'output-emitted' &&
						event.state === 'value' &&
						event.nodeId === 'ask' &&
						event.portId === 'reply',
				),
			),
		);

		runtime.runner.start();
		hitl.submitReply('yes');

		const event = await replyPromise;
		expect(event.kind === 'output-emitted' && event.value).toBe('yes');
		expect(event.edgeIds).toEqual([]);
	});
});
