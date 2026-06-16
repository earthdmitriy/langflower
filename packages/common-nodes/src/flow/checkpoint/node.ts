import { defineReactiveNode } from '@langflower/node-sdk';

/**
 * Author-visible durable resume boundary (ADR-018 D).
 *
 * Passthrough on `value`; when the output emits, the server writes a
 * JSON-safe upstream checkpoint. Optional inline `label` is stored on the
 * checkpoint summary for the operator picker.
 */
export const checkpointNode = defineReactiveNode({
	type: 'common-checkpoint',
	displayName: 'Checkpoint',
	category: 'Flow',
	paletteSecondary: true,
	description:
		'Passthrough that **writes a durable checkpoint** when crossed. ' +
		'Stop without crossing a Checkpoint does not create a resume point. ' +
		'Optional **label** appears in the Continue picker.',
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
