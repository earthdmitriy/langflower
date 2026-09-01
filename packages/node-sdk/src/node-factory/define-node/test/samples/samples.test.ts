import { RuntimeFacade } from '@langflower/runtime';
import { emptyResolveSecret } from '@langflower/node-sdk';
import { createNodeHarness } from '@langflower/node-sdk/testing';
import { filter, firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { defineNode } from '../../define-node.js';
import { gateSampleNode } from './gate-node.js';

const failingSampleNode = defineNode({
	type: 'sample-fail',
	displayName: 'Fail',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'boolean', required: true },
	},
	outputs: {
		result: { wireType: 'boolean' },
	},
	execute() {
		throw new Error('boom');
	},
});

const delayedSampleNode = defineNode({
	type: 'sample-delayed',
	displayName: 'Delayed',
	uiSchema: [] as const,
	inputs: {
		value: { wireType: 'string', required: true },
	},
	outputs: {
		result: { wireType: 'string' },
	},
	async execute(_ctx, inputs) {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 30);
		});
		return { result: String(inputs.value ?? '') };
	},
});

describe('defineNode samples', () => {
	it('exposes catalog metadata without bind on the definition', () => {
		expect('bind' in gateSampleNode).toBe(false);
		expect(gateSampleNode.type).toBe('sample-gate');
		expect(gateSampleNode.displayName).toBe('Gate');
		expect(gateSampleNode.emitOncePerActivation).toBe(true);
	});

	it('execute maps inputs to outputs without author rxjs', async () => {
		const harness = createNodeHarness(gateSampleNode, {
			nodeId: 'gate-1',
		});
		const ok = harness.next<boolean>('ok');
		harness.send('code', 0);
		await expect(ok).resolves.toBe(true);
		harness.dispose();
	});

	it('async execute emits pending before the result', async () => {
		const harness = createNodeHarness(delayedSampleNode, {
			nodeId: 'delayed-1',
		});
		const pendingSeen: boolean[] = [];
		const values: unknown[] = [];
		const output = harness.instance.outputs.result;
		if (output === undefined) {
			throw new Error('delayed sample missing result output');
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
		await expect(harness.next<string>('result')).resolves.toBe('later');
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

	it('thrown execute error fails the output port', async () => {
		const runtime = new RuntimeFacade({ log: false });
		const instance = failingSampleNode.getInstance();

		instance.ctxConnection.connect(
			of({
				projectDir: '/tmp',
				runId: 'test',
				nodeId: 'fail-1',
				params: {},
				uiSchema: failingSampleNode.uiSchema,
				resolveSecret: emptyResolveSecret,
			}),
		);
		instance.inputs.trigger.connect(of(true));

		runtime.editor.addNode({
			nodeId: 'fail-1',
			inputs: instance.inputs,
			outputs: instance.outputs,
			bypassPorts: instance.bypassPorts,
		});

		const errorPromise = firstValueFrom(
			runtime.runner.events$.pipe(
				filter(
					(event) =>
						event[0] === 'out' &&
						'error' in event[3] &&
						event[1] === 'fail-1',
				),
			),
		);

		runtime.runner.start();
		const errorEvent = await errorPromise;
		expect(String(errorEvent[3].error)).toMatch(/boom/);
	});
});
