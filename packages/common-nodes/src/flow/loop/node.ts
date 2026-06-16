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
	description:
		'Map-collect over a runtime list: emit each **item** to an external body, collect **results** (JSON array). Dynamic N without graph rewrite.',
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

		const { item$, results$ } = createMapCollectStreams({
			items,
			bodyResult,
			normalize: normalizeLoopItems,
		});

		return {
			inputs: [items, bodyResult],
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
