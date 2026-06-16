import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { combineLatest, of } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type CombineTestNodeOptions = {
	readonly nodeId: string;
	readonly separator?: string;
};

type CombineTestNodeResult = {
	readonly a: unknown;
	readonly b: unknown;
	readonly combined: string;
};

/**
 * Two input ports (`a`, `b`) merged with `combineLatest` → `combined` output.
 */
export function createCombineTestNode(
	options: CombineTestNodeOptions,
): RuntimeNode {
	const { nodeId, separator = '|' } = options;
	const slotA = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'a',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const slotB = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'b',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: combineLatest([slotA.value$, slotB.value$]),
		loader: ([a, b]) =>
			of({
				a,
				b,
				combined: `${String(a ?? '')}${separator}${String(b ?? '')}`,
			} satisfies CombineTestNodeResult),
		meta: {
			dir: 'out',
			portId: 'combined',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { a: slotA, b: slotB },
		outputs: { combined: output },
		bypassPorts: {},
	};
}
