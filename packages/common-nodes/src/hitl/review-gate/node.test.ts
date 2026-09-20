import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { hitlReviewGateNode } from './node.js';

describe('common-hitl-review-gate pending', () => {
	it('exposes response and feedback only', () => {
		expect(
			hitlReviewGateNode.outputsConfigs.map((entry) => entry.portId),
		).toEqual(['response', 'feedback']);
	});

	it('response stays pending after result until approve', async () => {
		const gate = hitlReviewGateNode.getInstance();
		const pendingSeen: boolean[] = [];
		const values: string[] = [];
		const sub = gate.outputs.response.subscribe({
			pending: (pending) => {
				pendingSeen.push(pending);
			},
			next: (value) => {
				values.push(String(value));
			},
		});

		gate.inputs.result.connect(of('draft'));
		await Promise.resolve();
		expect(pendingSeen).toContain(true);
		expect(values).toEqual([]);

		gate.inputs.approve.connect(of(true));
		await expect(
			firstValueFrom(gate.outputs.response.value$),
		).resolves.toBe('draft');
		sub.unsubscribe();
		expect(values).toEqual(['draft']);
	});

	it('feedback-wired instance still receives result', async () => {
		const gate = hitlReviewGateNode.getInstance();
		const incoming: string[] = [];
		const resultSub = gate.inputs.result.subscribe({
			next: (value) => {
				incoming.push(String(value));
			},
		});
		const feedbackSub = gate.outputs.feedback.subscribe({});

		gate.inputs.result.connect(of('needs work'));
		await Promise.resolve();
		expect(incoming).toEqual(['needs work']);

		gate.inputs.requestChanges.connect(of('tighten the lead'));
		await expect(
			firstValueFrom(gate.outputs.feedback.value$),
		).resolves.toBe('tighten the lead');
		feedbackSub.unsubscribe();
		resultSub.unsubscribe();
	});
});
