import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { embedSimilarityNode } from './node.js';

const connectSimilarity = (a: unknown, b: unknown) => {
	const instance = embedSimilarityNode.getInstance();
	instance.inputs.a.connect(of(a));
	instance.inputs.b.connect(of(b));
	return instance;
};

describe('common-embed-similarity', () => {
	it('has no provider panel fields', () => {
		expect(embedSimilarityNode.uiSchema).toEqual([]);
	});

	it('returns 1 for identical unit vectors', async () => {
		const vector = [1, 0, 0];
		const instance = connectSimilarity(vector, vector);

		await expect(
			firstValueFrom(instance.outputs.score.value$),
		).resolves.toBe(1);
	});

	it('returns cosine for arbitrary vectors', async () => {
		const instance = connectSimilarity([3, 4], [4, 3]);

		await expect(
			firstValueFrom(instance.outputs.score.value$),
		).resolves.toBeCloseTo(0.96, 2);
	});

	it('throws on dim mismatch', async () => {
		const instance = connectSimilarity([1, 2], [1, 2, 3]);

		await expect(
			firstValueFrom(instance.outputs.score.value$),
		).rejects.toThrow(/dim mismatch/);
	});

	it('throws on zero-norm vector', async () => {
		const instance = connectSimilarity([0, 0], [1, 0]);

		await expect(
			firstValueFrom(instance.outputs.score.value$),
		).rejects.toThrow(/zero-norm/);
	});

	it('throws when inputs are not arrays', async () => {
		const instance = connectSimilarity('not-json', [1]);

		await expect(
			firstValueFrom(instance.outputs.score.value$),
		).rejects.toThrow(/must be a JSON number array/);
	});
});
