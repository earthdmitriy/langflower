import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { readOutputValue } from '../readOutputValue.js';
import { createAgentTestNode, emitDraftDeltas } from './agent-node.js';

describe('createAgentTestNode', () => {
	it('emits draft stream and single response', async () => {
		const agent = createAgentTestNode({
			nodeId: 'agent',
			draftDeltas: ['Hel', 'lo', ' world'],
			responsePrefix: 'Done',
		});
		const collected: string[] = [];
		const sub = agent.outputs.draft.subscribe({
			next: (value) => collected.push(String(value)),
		});

		agent.inputs.prompt.connect(of('Write a poem'));

		await new Promise((resolve) => {
			setTimeout(resolve, 30);
		});

		sub.unsubscribe();

		expect(collected).toEqual(['Hel', 'lo', ' world']);
		expect(await readOutputValue(agent.outputs.response)).toBe(
			'Done: Write a poem',
		);
	});

	it('emitDraftDeltas completes after the last token', async () => {
		let completed = false;

		emitDraftDeltas(['a', 'b']).subscribe({
			complete: () => {
				completed = true;
			},
		});

		await new Promise((resolve) => {
			setTimeout(resolve, 5);
		});

		expect(completed).toBe(true);
	});

	it('prefers feedback over prompt on response', async () => {
		const agent = createAgentTestNode({
			nodeId: 'agent',
			responsePrefix: 'Agent',
		});

		agent.inputs.prompt.connect(of('initial'));
		agent.inputs.feedback.connect(of('revised'));

		expect(await readOutputValue(agent.outputs.response)).toBe(
			'Agent: revised',
		);
	});
});
