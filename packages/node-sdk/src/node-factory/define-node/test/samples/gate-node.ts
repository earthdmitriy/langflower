import { defineNode } from '../../define-node.js';

/**
 * Author sample for {@link defineNode}: sync execute, no rxjs import.
 * Passes when wired `code` is 0.
 */
export const gateSampleNode = defineNode({
	type: 'sample-gate',
	displayName: 'Gate',
	category: 'Samples',
	description: 'Emits ok=true when input code is 0.',
	uiSchema: [] as const,
	inputs: {
		code: { wireType: 'number', required: true },
	},
	outputs: {
		ok: { wireType: 'boolean' },
	},
	execute(_ctx, inputs) {
		const code = Number(inputs.code ?? NaN);
		return { ok: code === 0 };
	},
});
