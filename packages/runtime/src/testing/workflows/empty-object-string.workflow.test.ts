import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import type { PortMeta, RuntimeNode } from '../../types.js';
import { statefulConnection } from '@rx-evo/stateful-observable';
import {
	createRuntimeHarness,
	runAndCollectEvents,
	wireEdge,
} from './workflow-events.js';

const createStringLikeNode = (nodeId: string, value: string): RuntimeNode => {
	const input = statefulConnection<string, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'string',
			mode: 'single',
			defaultValue: '',
		} satisfies PortMeta,
	});
	input.connect(of(value));
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'string',
		} satisfies PortMeta,
	});
	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
	};
};

const createFinishLikeNode = (nodeId: string): RuntimeNode => {
	const input = statefulConnection<unknown, unknown, PortMeta>({
		meta: {
			dir: 'in',
			portId: 'value',
			wireType: 'any',
			mode: 'single',
		} satisfies PortMeta,
	});
	const output = input.with({
		meta: {
			dir: 'out',
			portId: 'value',
			wireType: 'any',
			fromInput: 'value',
		} satisfies PortMeta,
	});
	return {
		nodeId,
		inputs: { value: input },
		outputs: { value: output },
		bypassPorts: {},
		stopsRun: true,
		emitOncePerActivation: true,
	};
};

describe('string → finish: no empty-object value leak', () => {
	it('does not forward loading sentinel as value:{} on edges', async () => {
		const harness = createRuntimeHarness({ log: false });
		harness.editor.addNode(createStringLikeNode('string-1', 'Hello'));
		harness.editor.addNode(createFinishLikeNode('finish-1'));
		wireEdge(harness.editor, {
			fromNodeId: 'string-1',
			fromPort: ['value', 0],
			toNodeId: 'finish-1',
			toPort: ['value', 0],
		});

		const { events } = await runAndCollectEvents(
			harness,
			() => harness.runner.start(),
			200,
		);

		const stringValues = events.filter(
			(e) => e[0] === 'out' && e[1] === 'string-1' && e[2] === 'value',
		);

		const valueStates = stringValues.filter((e) => e[3] === 'value');
		expect(valueStates.map((e) => e[4])).toEqual(['Hello']);

		const emptyObjectValues = valueStates.filter(
			(e) =>
				typeof e[4] === 'object' &&
				e[4] !== null &&
				!Array.isArray(e[4]) &&
				Object.keys(e[4]).length === 0,
		);
		expect(emptyObjectValues).toEqual([]);

		const finishInputs = events.filter(
			(e) =>
				e[0] === 'in' &&
				e[1] === 'finish-1' &&
				e[2] === 'value' &&
				e[3] === 'value',
		);
		expect(finishInputs.map((e) => e[4])).toEqual(['Hello']);
	});
});
