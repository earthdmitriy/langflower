import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { hitlReviewGateNode } from './node.js';

describe('common-hitl-review-gate pending', () => {
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
});
