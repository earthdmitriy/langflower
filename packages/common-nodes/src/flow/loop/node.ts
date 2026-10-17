import { defineReactiveNode } from '@langflower/node-sdk';
import {
	createMapCollectStreams,
	normalizeLoopItems,
} from '../map-collect-body.js';

/**
 * Dynamic fan-out / fan-in over `items[]` via an **external** body on the
 * canvas (epic 07, MECHANICS C2/C8). Each item is emitted on `item`; the body
 * result returns on `bodyResult`; when all slots finish, `results` emits a
 * JSON string array. Specialists keep their own internal tool loops.
 */
export const loopNode = defineReactiveNode({
	type: 'common-loop',
	displayName: 'Loop',
	category: 'Flow',
	paletteSecondary: true,
	description: `
Wire a list into **items**. **item** emits one entry at a time. Wire **item** into the body input, and wire that body's output back into **bodyResult**. The next **item** waits until **bodyResult** arrives. When every entry has one result, **results** emits a JSON array in the same order.

**items** accepts an array, a JSON array, or one entry per line. An empty list emits **results** \`[]\`. A new **items** value starts the list over.
`.trim(),
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const items = makeInput<unknown>('items', {
			name: 'items',
			dynamic: true,
			required: true,
		});
		const bodyResult = makeInput<unknown>('bodyResult', {
			name: 'bodyResult',
			dynamic: true,
			required: true,
		});
		const rerunItems = makeInput<unknown>('rerunItems', {
			name: 'rerunItems',
			dynamic: true,
		});

		const { item$, results$ } = createMapCollectStreams({
			items,
			bodyResult,
			rerunItems,
			normalize: normalizeLoopItems,
		});

		return {
			inputs: [items, bodyResult, rerunItems],
			outputs: [
				configureOutput('item', item$, {
					wireType: 'string',
				}),
				configureOutput('results', results$, {
					wireType: 'string',
					feed: { role: 'result' },
				}),
			],
		};
	},
});
