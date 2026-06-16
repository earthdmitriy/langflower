import { defineReactiveNode } from '@langflower/node-sdk';
import type { RuntimeWireType } from '@langflower/runtime';
import { COMMON_ROUTER_TYPE } from './router-constants.js';

/** N-channel router — bypass ports only; canvas channels from `routerChannels`. */
export const routerNode = defineReactiveNode({
	type: COMMON_ROUTER_TYPE,
	displayName: 'Router',
	category: 'Flow',
	description:
		'Use for **visual organisation of edges** in complex workflows. Any number of inputs can be connected — input ports expand dynamically.',
	uiSchema: [] as const,
	bind() {
		return { inputs: [], outputs: [] };
	},
	bypassPorts: { ch: 'dynamic' as RuntimeWireType },
});
