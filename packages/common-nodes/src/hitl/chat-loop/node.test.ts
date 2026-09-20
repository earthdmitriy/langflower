import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { chatLoopNode } from './node.js';

describe('common-chat-loop', () => {
	it('exposes one feedback out and a hidden reply HITL input', () => {
		expect(chatLoopNode.type).toBe('common-chat-loop');
		expect(chatLoopNode.chatEntry).toBe(false);
		expect(
			chatLoopNode.outputsConfigs.map((entry) => entry.portId),
		).toEqual(['feedback']);

		const messageMeta = chatLoopNode.inputsConfigs.find(
			(entry) => entry.portId === 'message',
		);

		expect(messageMeta?.hidden).toBe(true);
		expect(messageMeta?.hitl?.kind).toBe('textarea');
		expect(
			messageMeta?.hitl?.kind === 'textarea'
				? messageMeta.hitl.submitLabel
				: undefined,
		).toBe('Send');
		expect(
			messageMeta?.hitl?.kind === 'textarea'
				? messageMeta.hitl.role
				: undefined,
		).toBe('reply');
	});

	it('feedback stays pending after result until Send', async () => {
		const loop = chatLoopNode.getInstance();
		const pendingSeen: boolean[] = [];
		const values: string[] = [];
		const sub = loop.outputs.feedback.subscribe({
			pending: (pending) => {
				pendingSeen.push(pending);
			},
			next: (value) => {
				values.push(String(value));
			},
		});

		loop.inputs.result.connect(of('agent turn'));
		await Promise.resolve();
		expect(pendingSeen).toContain(true);
		expect(values).toEqual([]);

		loop.inputs.message.connect(of('hello back'));
		await expect(
			firstValueFrom(loop.outputs.feedback.value$),
		).resolves.toBe('hello back');
		sub.unsubscribe();
		expect(values).toEqual(['hello back']);
	});
});
