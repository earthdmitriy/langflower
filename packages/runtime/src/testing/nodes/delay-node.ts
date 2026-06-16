import {
	statefulConnection,
	statefulObservable,
} from '@rx-evo/stateful-observable';
import { combineLatest, concatMap, delay, of } from 'rxjs';
import type { NodeId, PortMeta, RuntimeNode } from '../../types.js';

export type DelayTestNodeOptions = {
	readonly nodeId: string;
	/** Delay in milliseconds (default 50). */
	readonly delayMs?: number;
};

/** Pass-through with async delay on `value` input. */
export function createDelayTestNode(
	options: DelayTestNodeOptions,
): RuntimeNode {
	const { nodeId, delayMs = 50 } = options;
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: valueIn.value$,
		loader: (inputValue) =>
			of(inputValue).pipe(delay(Math.max(0, delayMs))),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
}

/**
 * Pass-through that waits for a wired numeric `delay` input (ms), matching
 * `common-delay` — used to repro resume snapshot bugs on router bypass slots.
 */
export const createWiredDelayTestNode = (options: {
	readonly nodeId: string;
}): RuntimeNode => {
	const { nodeId } = options;
	const valueIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const delayIn = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'delay',
			wireType: 'number',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = statefulObservable({
		input: combineLatest([valueIn.value$, delayIn.value$]),
		loader: ([inputValue, delayMs]) =>
			of(inputValue).pipe(
				concatMap((value) =>
					of(value).pipe(
						// Same contract as common-delay: pass delayMs through.
						delay(delayMs as number),
					),
				),
			),
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
		} satisfies PortMeta,
	});

	return {
		nodeId: nodeId as NodeId,
		inputs: { value: valueIn, delay: delayIn },
		outputs: { value: output },
		bypassPorts: {},
		emitOncePerActivation: true,
	};
};
