import {
	defineReactiveNode,
	type WireType,
} from '../../define-reactive-node.js';

/** Router stand-in — each channel input passthrough to same-named output. */
export const routerSampleNode = defineReactiveNode({
	type: 'sample-router',
	displayName: 'Router',
	category: 'Samples',
	uiSchema: [] as const,
	bind() {
		return { inputs: [], outputs: [] };
	},
	bypassPorts: { ch: 'dynamic' as WireType },
});
