import { defineReactiveNode } from '@langflower/node-sdk';

/** Canvas annotation — hidden markdown note, no wires, no feed. */
export const hintNode = defineReactiveNode({
	type: 'common-hint',
	displayName: 'Hint',
	category: 'Output',
	description: `
Leave a markdown note on the canvas. This node is decoration only — it has no wires and does not run.

Typical uses:
- Remind a teammate how this branch is meant to work
- Pin a short checklist next to a cluster
`.trim(),
	defaultCanvasSize: { width: 320, height: 280 },
	uiSchema: [] as const,
	bind(_ctx, { makeInput }) {
		const note = makeInput<string>('note', {
			name: 'note',
			wireType: 'string',
			hidden: true,
			inline: 'markdown',
			defaultValue: '',
		});

		return {
			inputs: [note],
			outputs: [],
		};
	},
});
