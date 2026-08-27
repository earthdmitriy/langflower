import { createNodeHarness } from '@langflower/node-sdk/testing';
import { describe, expect, it } from 'vitest';
import { agentSampleNode } from './agent-node.js';
import { combineSampleNode } from './combine-node.js';
import { constantSampleNode } from './constant-node.js';
import { delaySampleNode } from './delay-node.js';
import { finishSampleNode } from './finish-node.js';
import { hitlSampleNode } from './hitl-node.js';
import { joinSampleNode } from './join-node.js';
import { previewSampleNode } from './preview-node.js';
import { routerSampleNode } from './router-node.js';

const samples = [
	constantSampleNode,
	delaySampleNode,
	combineSampleNode,
	joinSampleNode,
	finishSampleNode,
	previewSampleNode,
	routerSampleNode,
	hitlSampleNode,
	agentSampleNode,
] as const;

describe('defineReactiveNode samples', () => {
	it.each(samples.map((node) => [node.type, node] as const))(
		'%s exposes catalog metadata without bind',
		(_type, node) => {
			expect('bind' in node).toBe(false);

			expect(node.type).toBe(_type);
			expect(node.displayName).toBeTypeOf('string');
		},
	);

	it('constant sample emits once per activation', () => {
		expect(constantSampleNode.emitOncePerActivation).toBe(true);
		expect(Object.keys(constantSampleNode.getInstance().outputs)).toEqual([
			'value',
		]);
	});

	it('finish sample stops the run', () => {
		expect(finishSampleNode.stopsRun).toBe(true);
	});

	it('finish sample passthrough output meta is JSON-serializable', () => {
		const valueOut = finishSampleNode.outputsConfigs.find(
			(port) => port.portId === 'value',
		);

		expect(valueOut).toBeDefined();
		expect(valueOut).toMatchObject({
			fromInput: 'value',
			wireType: 'dynamic',
		});
		expect(valueOut).not.toHaveProperty('inferTypeFrom');
		expect(() => JSON.stringify(valueOut)).not.toThrow();
		expect(JSON.stringify(valueOut)).not.toContain('currentObservers');
	});

	it('join sample declares multi-slot lines input', () => {
		expect(Object.keys(joinSampleNode.getInstance().inputs)).toEqual([
			'lines',
		]);
	});

	it('router sample has no runtime IO (bypass-only)', () => {
		expect(Object.keys(routerSampleNode.getInstance().outputs)).toEqual([]);
	});

	it('agent sample declares draft and response outputs', () => {
		expect(
			Object.keys(agentSampleNode.getInstance().outputs).sort(),
		).toEqual(['draft', 'response']);
	});

	it('hitl sample receives user reply via marked input connection', async () => {
		expect(
			hitlSampleNode.inputsConfigs.find(
				(input) => input.hitl !== undefined,
			)?.hitl,
		).toEqual({
			title: 'Your reply',
			promptFrom: 'prompt',
			kind: 'textarea',
			submitLabel: 'Send',
		});

		const first = createNodeHarness(hitlSampleNode);
		const second = createNodeHarness(hitlSampleNode);

		expect(first.instance.inputs.reply).not.toBe(
			second.instance.inputs.reply,
		);

		const firstReply = first.next<string>('reply');
		const secondReply = second.next<string>('reply');
		first.send('reply', 'first');
		second.send('reply', 'second');

		await expect(firstReply).resolves.toBe('first');
		await expect(secondReply).resolves.toBe('second');
		first.dispose();
		second.dispose();
	});

	it('delay sample emits pending before the delayed value', async () => {
		const harness = createNodeHarness(delaySampleNode, {
			params: { delayMs: 30 },
		});
		const pendingSeen: boolean[] = [];
		const values: unknown[] = [];
		const output = harness.instance.outputs.value;
		if (output === undefined) {
			throw new Error('delay sample missing value output');
		}
		const sub = output.subscribe({
			pending: (pending) => {
				pendingSeen.push(pending);
			},
			next: (value) => {
				values.push(value);
			},
		});
		harness.send('value', 'later');
		await expect(harness.next<string>('value')).resolves.toBe('later');
		sub.unsubscribe();
		harness.dispose();
		expect(pendingSeen).toContain(true);
		expect(values).toEqual(['later']);
		expect(pendingSeen.indexOf(true)).toBeLessThan(
			pendingSeen.lastIndexOf(false) === -1
				? pendingSeen.length
				: pendingSeen.lastIndexOf(false),
		);
	});
});
