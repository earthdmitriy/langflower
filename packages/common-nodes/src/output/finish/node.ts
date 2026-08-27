import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

/** Passthrough sink — first output emission stops the run. */
export const finishNode = defineReactiveNode({
	type: 'common-finish',
	displayName: 'Finish',
	category: 'Output',
	description: `
Last step of a run. When this node outputs, the run **stops**.

Wire the final result here so Start/Stop settle instead of hanging on open work.
`.trim(),
	stopsRun: true,
	emitOncePerActivation: true,
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const value = makeInput('value', { name: 'value', required: true });
		const done$ = value.pipeValue(map(() => 'done'));

		return {
			inputs: [value],
			outputs: [
				configureOutput('done', done$, {
					wireType: 'string',
					hidden: true,
					feed: { role: 'result' },
				}),
				configureOutput('value', value, {
					inferTypeFrom: value,
					feed: { role: 'none' },
				}),
			],
		};
	},
});
