import { map } from 'rxjs';
import { defineReactiveNode } from '../../define-reactive-node.js';

/** Source node — emits panel `value` on output (no inputs). */
export const constantSampleNode = defineReactiveNode({
	type: 'sample-constant',
	displayName: 'Constant',
	category: 'Samples',
	emitOncePerActivation: true,
	uiSchema: [{ field: 'value', type: 'string', default: '' }] as const,
	bind(ctx, { configureOutput }) {
		const text$ = ctx.pipeValue(
			map((ec) => String(ec.params?.value ?? '')),
		);

		return {
			inputs: [],
			outputs: [
				configureOutput('value', text$, {
					wireType: 'string',
				}),
			],
		};
	},
});
