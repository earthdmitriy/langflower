import { defineNode } from '@langflower/node-sdk';
import { RuntimeFacade, type NodeId } from '@langflower/runtime';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { chatInputNode } from './chat-input/node.js';
import { chatLoopNode } from './chat-loop/node.js';
import { hitlReviewGateNode } from './review-gate/node.js';

/**
 * A node written against the SDK surface before attachments and union wire
 * types: plain `defineNode`, string ports, no knowledge of `user-turn`.
 */
const legacyStringNode = defineNode({
	type: 'legacy-upper',
	displayName: 'Legacy upper',
	uiSchema: [] as const,
	inputs: { text: { wireType: 'string', required: true } },
	outputs: { out: { wireType: 'string' } },
	execute: (_ctx, inputs) => ({ out: String(inputs.text).toUpperCase() }),
});

const png = {
	fileId: 'file-1',
	name: '1.png',
	mimeType: 'image/png',
	size: 3,
};

const asId = (id: string): NodeId => id as NodeId;

describe('nodes written before attachments keep working', () => {
	const connects = (
		producer: typeof chatInputNode,
		outPort: string,
	): boolean => {
		const runtime = new RuntimeFacade({ log: false });
		const from = producer.getInstance();
		const to = legacyStringNode.getInstance();
		runtime.editor.addNode({ nodeId: asId('a'), ...from });
		runtime.editor.addNode({ nodeId: asId('b'), ...to });
		return (
			runtime.editor.addEdge({
				fromNodeId: asId('a'),
				fromPort: [outPort, 0],
				toNodeId: asId('b'),
				toPort: ['text', 0],
			}) !== false
		);
	};

	it('a saved edge from Chat Input message, Chat Loop feedback, or Review Gate feedback to a string input still connects', () => {
		expect(connects(chatInputNode, 'message')).toBe(true);
		expect(connects(chatLoopNode, 'feedback')).toBe(true);
		expect(connects(hitlReviewGateNode as never, 'feedback')).toBe(true);
	});

	it('hands that string input the plain string when no file is attached', async () => {
		const chat = chatInputNode.getInstance();
		chat.inputs.message.connect(of('hello'));
		await expect(firstValueFrom(chat.outputs.message.value$)).resolves.toBe(
			'hello',
		);

		const loop = chatLoopNode.getInstance();
		loop.inputs.result.connect(of('agent turn'));
		loop.inputs.message.connect(of({ text: 'reply', files: [] }));
		await expect(
			firstValueFrom(loop.outputs.feedback.value$),
		).resolves.toBe('reply');

		const gate = hitlReviewGateNode.getInstance();
		gate.inputs.result.connect(of('draft'));
		gate.inputs.requestChanges.connect(of({ text: 'shorter', files: [] }));
		await expect(
			firstValueFrom(gate.outputs.feedback.value$),
		).resolves.toBe('shorter');
	});

	it('only a reply that carries files becomes a user turn', async () => {
		const chat = chatInputNode.getInstance();
		chat.inputs.message.connect(of({ text: 'look', files: [png] }));
		await expect(
			firstValueFrom(chat.outputs.message.value$),
		).resolves.toEqual({ text: 'look', files: [png] });
		// The string output stays text for string consumers.
		await expect(firstValueFrom(chat.outputs.text.value$)).resolves.toBe(
			'look',
		);
	});
});
