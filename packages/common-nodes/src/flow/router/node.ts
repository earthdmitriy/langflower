import { defineReactiveNode } from '@langflower/node-sdk';
import type { RuntimeWireType } from '@langflower/runtime';
import { COMMON_ROUTER_TYPE } from './router-constants.js';

/** N-channel router — bypass ports only; canvas channels from `routerChannels`. */
export const routerNode = defineReactiveNode({
	type: COMMON_ROUTER_TYPE,
	displayName: 'Router',
	category: 'Flow',
	description: `
Tidy a busy canvas: any number of inputs can connect, and extra ports appear as you wire more.

Typical uses:
- Group many edges so they stay readable
- Fan-out one stream to several destinations
`.trim(),
	uiSchema: [] as const,
	bind() {
		return { inputs: [], outputs: [] };
	},
	bypassPorts: { ch: 'dynamic' as RuntimeWireType },
});
