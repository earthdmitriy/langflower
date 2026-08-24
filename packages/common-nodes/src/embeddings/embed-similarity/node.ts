import { defineReactiveNode } from '@langflower/node-sdk';

const toNumberVector = (value: unknown, label: string): readonly number[] => {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be a JSON number array`);
	}

	return value.map((entry, index) => {
		const n = Number(entry);
		if (!Number.isFinite(n)) {
			throw new Error(`${label}[${index}] must be a finite number`);
		}
		return n;
	});
};

const l2Normalize = (values: readonly number[]): Float32Array => {
	const out = new Float32Array(values.length);
	let sumSq = 0;
	for (let i = 0; i < values.length; i += 1) {
		const n = values[i] ?? 0;
		out[i] = n;
		sumSq += n * n;
	}
	const norm = Math.sqrt(sumSq);
	if (norm === 0) {
		throw new Error('Cannot compute similarity for a zero-norm vector');
	}
	const scale = 1 / norm;
	for (let i = 0; i < out.length; i += 1) {
		out[i] = (out[i] ?? 0) * scale;
	}
	return out;
};

const cosineSimilarity = (
	left: readonly number[],
	right: readonly number[],
): number => {
	if (left.length !== right.length) {
		throw new Error(
			`Vector dim mismatch: ${left.length} vs ${right.length}`,
		);
	}

	const a = l2Normalize(left);
	const b = l2Normalize(right);
	let sum = 0;
	for (let i = 0; i < a.length; i += 1) {
		sum += (a[i] ?? 0) * (b[i] ?? 0);
	}
	return sum;
};

/**
 * UC1: L2-normalized dot (cosine) between two wired JSON vectors.
 * Pure / offline — no HTTP, no provider panel.
 */
export const embedSimilarityNode = defineReactiveNode({
	type: 'common-embed-similarity',
	displayName: 'Embed similarity',
	category: 'Embeddings',
	description: `
Score how close two vectors are (cosine, typically 0–1).

Typical uses:
- Compare two Embed text outputs
- Rank which snippet matches a query
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput, combineInputs }) {
		const a = makeInput<unknown>('a', {
			name: 'a',
			wireType: 'json',
			required: true,
		});
		const b = makeInput<unknown>('b', {
			name: 'b',
			wireType: 'json',
			required: true,
		});

		const score$ = combineInputs([a, b], ([left, right]) =>
			cosineSimilarity(
				toNumberVector(left, 'a'),
				toNumberVector(right, 'b'),
			),
		);

		return {
			inputs: [a, b],
			outputs: [
				configureOutput('score', score$, {
					wireType: 'number',
				}),
			],
		};
	},
});
