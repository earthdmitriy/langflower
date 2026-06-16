import { statefulObservable } from '@rx-evo/stateful-observable';
import { Subject } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type PushableTestNodeOptions = {
	readonly nodeId: string;
};

export type PushableTestNodeHandle = {
	readonly node: RuntimeNode;
	/** Push a new success value on `value`. */
	readonly next: (value: string) => void;
};

/**
 * Source node backed by a Subject — emits each `next` call on `value`.
 * Used to prove zip flush (re-fire one slot without sibling).
 */
export function createPushableTestNode(
	options: PushableTestNodeOptions,
): PushableTestNodeHandle {
	const { nodeId } = options;
	const subject$ = new Subject<string>();
	const output = statefulObservable({
		loader: () => subject$,
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'string',
		} satisfies PortMeta,
	});

	return {
		node: {
			nodeId: nodeId as NodeId,
			inputs: {},
			outputs: { value: output },
			bypassPorts: {},
		},
		next: (value) => {
			subject$.next(value);
		},
	};
}
