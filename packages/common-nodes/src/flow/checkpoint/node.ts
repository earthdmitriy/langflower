import { defineReactiveNode } from '@langflower/node-sdk';

/**
 * Author-visible resume boundary.
 *
 * Passthrough on `value`. When the output emits and a workflow session is
 * bound, the server appends an immutable point. Optional inline `label`
 * is stored on that point.
 */
export const checkpointNode = defineReactiveNode({
	type: 'common-checkpoint',
	displayName: 'Checkpoint',
	category: 'Flow',
	paletteSecondary: true,
	description: `
Save a resume point when the run passes this node. Stop without crossing it does **not** create Continue.

Typical uses:
- A safe place to resume a long job
- Optional **label** in the Continue picker
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value = makeInput<unknown>('value', {
			name: 'value',
			dynamic: true,
			required: true,
		});
		const label = makeInput<string>('label', {
			name: 'label',
			wireType: 'string',
			inline: 'text',
			defaultValue: '',
		});

		return {
			inputs: [value, label],
			outputs: [
				configureOutput('value', value, {
					inferTypeFrom: value,
					createCheckpoint: true,
				}),
			],
		};
	},
});
