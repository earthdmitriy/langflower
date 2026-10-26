import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { hitlReviewGateNode } from './node.js';

describe('common-hitl-review-gate pending', () => {
	it('exposes response and feedback only', () => {
		expect(
			hitlReviewGateNode.outputsConfigs.map((entry) => entry.portId),
		).toEqual(['response', 'feedback']);
	});

	it('continues result through response when the gate is deleted', () => {
		const response = hitlReviewGateNode.outputsConfigs.find(
			(entry) => entry.portId === 'response',
		);
		const feedback = hitlReviewGateNode.outputsConfigs.find(
			(entry) => entry.portId === 'feedback',
		);

		expect(response).toMatchObject({
			wireType: 'string',
			rewireFrom: 'result',
		});
		expect(feedback).not.toHaveProperty('rewireFrom');
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

	describe('request-changes attachments', () => {
		const png = {
			fileId: 'file-1',
			name: '1.png',
			mimeType: 'image/png',
			size: 3,
		};

		it('declares a union input and a union feedback output', () => {
			const requestChanges = hitlReviewGateNode.inputsConfigs.find(
				(entry) => entry.portId === 'requestChanges',
			);
			const feedback = hitlReviewGateNode.outputsConfigs.find(
				(entry) => entry.portId === 'feedback',
			);

			expect(requestChanges?.wireType).toEqual(['string', 'user-turn']);
			expect(feedback?.wireType).toEqual(['string', 'user-turn']);
		});

		it('keeps feedback a plain string when no file is attached', async () => {
			for (const reply of ['shorter', { text: 'shorter', files: [] }]) {
				const gate = hitlReviewGateNode.getInstance();
				gate.inputs.result.connect(of('draft'));
				gate.inputs.requestChanges.connect(of(reply));
				await expect(
					firstValueFrom(gate.outputs.feedback.value$),
				).resolves.toBe('shorter');
			}
		});

		it('emits a user turn when files are attached', async () => {
			const gate = hitlReviewGateNode.getInstance();
			const turn = { text: 'match this', files: [png] };
			gate.inputs.result.connect(of('draft'));
			gate.inputs.requestChanges.connect(of(turn));
			await expect(
				firstValueFrom(gate.outputs.feedback.value$),
			).resolves.toEqual(turn);
		});
	});

	describe('wait state', () => {
		const seen = (
			gate: ReturnType<typeof hitlReviewGateNode.getInstance>,
		) => {
			const states: unknown[] = [];
			gate.state?.persist$.subscribe((state) => {
				states.push(state);
			});
			return states;
		};

		it('saves the waiting result and clears it on Approve', async () => {
			const gate = hitlReviewGateNode.getInstance();
			const states = seen(gate);
			const response = gate.outputs.response.subscribe({
				next: () => undefined,
			});

			gate.inputs.result.connect(of('draft'));
			await Promise.resolve();
			expect(states).toContainEqual({ result: 'draft' });

			gate.inputs.approve.connect(of(true));
			await firstValueFrom(gate.outputs.response.value$);
			expect(states.at(-1)).toEqual({ result: null });
			response.unsubscribe();
		});

		it('clears the waiting state when changes are requested', async () => {
			const gate = hitlReviewGateNode.getInstance();
			const states = seen(gate);
			const feedback = gate.outputs.feedback.subscribe({
				next: () => undefined,
			});

			gate.inputs.result.connect(of('draft'));
			gate.inputs.requestChanges.connect(of('shorter'));
			await firstValueFrom(gate.outputs.feedback.value$);

			expect(states).toContainEqual({ result: 'draft' });
			expect(states.at(-1)).toEqual({ result: null });
			feedback.unsubscribe();
		});

		it('re-opens its own wait from restored state, with no result coming in', async () => {
			const gate = hitlReviewGateNode.getInstance();
			expect(gate.state?.restore({ result: 'draft' })).toEqual({
				ok: true,
			});
			const reviewed: string[] = [];
			const sub = gate.outputs.response.subscribe({
				next: (value) => {
					reviewed.push(String(value));
				},
			});

			gate.inputs.approve.connect(of(true));
			await firstValueFrom(gate.outputs.response.value$);

			expect(reviewed).toEqual(['draft']);
			sub.unsubscribe();
		});

		it('restores nothing from a state that records no wait', async () => {
			for (const state of [null, { result: null }, { history: [] }]) {
				const gate = hitlReviewGateNode.getInstance();
				gate.state?.restore(state);
				const values: unknown[] = [];
				const sub = gate.outputs.response.subscribe({
					next: (value) => {
						values.push(value);
					},
				});
				gate.inputs.approve.connect(of(true));
				await Promise.resolve();
				expect(values).toEqual([]);
				sub.unsubscribe();
			}
		});
	});
});
