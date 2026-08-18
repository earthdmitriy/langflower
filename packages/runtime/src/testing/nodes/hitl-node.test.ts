import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import {
	createRuntimeHarness,
	edgeIdsFromPortEvent,
} from '../workflows/workflow-events.js';
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
						event[0] === 'out' &&
						'value' in event[3] &&
						event[1] === 'ask' &&
						event[2] === 'reply',
				),
			),
		);

		runtime.runner.start();
		await Promise.resolve();
		hitl.submitReply('yes');

		const event = await replyPromise;
		expect(event[0] === 'out' && event[3].value).toBe('yes');
		expect(edgeIdsFromPortEvent(event)).toEqual([]);
	});
});
