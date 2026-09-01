import { from, map, mergeMap } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { defineNode } from '../node-factory/define-node/define-node.js';
import { defineReactiveNode } from '../node-factory/define-reactive-node/define-reactive-node.js';
import { createNodeHarness } from './create-node-harness.js';

const echoNode = defineNode({
	type: 'harness-echo',
	displayName: 'Echo',
	uiSchema: [{ field: 'prefix', type: 'string', default: 'hi' }] as const,
	inputs: {
		text: { wireType: 'string', required: true },
	},
	outputs: {
		text: { wireType: 'string' },
	},
	execute(ctx, inputs) {
		const prefix = String(ctx.params.prefix ?? '');
		return { text: `${prefix}:${String(inputs.text ?? '')}` };
	},
});

const ticksNode = defineReactiveNode({
	type: 'harness-ticks',
	displayName: 'Ticks',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const count = makeInput<number>('count', {
			name: 'count',
			wireType: 'number',
			required: true,
		});
		const ticks$ = count.pipeValue(
			mergeMap((n) => from(Array.from({ length: n }, (_, i) => i))),
		);
		return {
			inputs: [count],
			outputs: [configureOutput('tick', ticks$, { wireType: 'number' })],
		};
	},
});

const paramsNode = defineReactiveNode({
	type: 'harness-params',
	displayName: 'Params',
	uiSchema: [{ field: 'mode', type: 'string', default: 'fast' }] as const,
	bind(ctx, { configureOutput }) {
		const mode$ = ctx.pipeValue(map((ec) => String(ec.params.mode ?? '')));
		return {
			inputs: [],
			outputs: [configureOutput('mode', mode$, { wireType: 'string' })],
		};
	},
});

const secretNode = defineReactiveNode({
	type: 'harness-secret',
	displayName: 'Secret',
	uiSchema: [] as const,
	bind(ctx, { configureOutput }) {
		const token$ = ctx.pipeValue(
			map((ec) => {
				const result = ec.resolveSecret('lf_secret:API_TOKEN');
				if (!result.ok) {
					throw new Error(result.message);
				}
				return result.value;
			}),
		);
		return {
			inputs: [],
			outputs: [configureOutput('token', token$, { wireType: 'string' })],
		};
	},
});

const envSecretNode = defineReactiveNode({
	type: 'harness-env-secret',
	displayName: 'Env secret',
	uiSchema: [] as const,
	bind(ctx, { configureOutput }) {
		const token$ = ctx.pipeValue(
			map((ec) => {
				const result = ec.resolveSecret('env:API_TOKEN');
				if (!result.ok) {
					throw new Error(result.message);
				}
				return result.value;
			}),
		);
		return {
			inputs: [],
			outputs: [configureOutput('token', token$, { wireType: 'string' })],
		};
	},
});

describe('createNodeHarness', () => {
	it('throws on unknown input and output ports', async () => {
		const harness = createNodeHarness(echoNode);
		expect(() => harness.send('missing', 1)).toThrow(
			/Unknown input port "missing"/,
		);
		await expect(harness.next('missing')).rejects.toThrow(
			/Unknown output port "missing"/,
		);
		expect(() => harness.collect('missing')).toThrow(
			/Unknown output port "missing"/,
		);
		harness.dispose();
	});

	it('send then next maps an input to an output', async () => {
		const harness = createNodeHarness(echoNode);
		const text = harness.next<string>('text');
		harness.send('text', 'world');
		await expect(text).resolves.toBe('hi:world');
		harness.dispose();
	});

	it('collect records a streaming output', async () => {
		const harness = createNodeHarness(ticksNode);
		const ticks = harness.collect<number>('tick');
		const last = harness.next<number>('tick');
		harness.send('count', 3);
		await last;
		expect([...ticks.values]).toEqual([0, 1, 2]);
		ticks.stop();
		harness.dispose();
	});

	it('seeds ctx params from uiSchema defaults and options', async () => {
		const fromDefault = createNodeHarness(paramsNode);
		await expect(fromDefault.next<string>('mode')).resolves.toBe('fast');
		fromDefault.dispose();

		const overridden = createNodeHarness(paramsNode, {
			params: { mode: 'slow' },
		});
		await expect(overridden.next<string>('mode')).resolves.toBe('slow');
		overridden.dispose();
	});

	it('seeds ctx secrets for resolveSecret', async () => {
		const harness = createNodeHarness(secretNode, {
			secrets: { API_TOKEN: 'sk-live' },
		});
		await expect(harness.next<string>('token')).resolves.toBe('sk-live');
		harness.dispose();
	});

	it('resolves env: refs from harness env', async () => {
		const harness = createNodeHarness(envSecretNode, {
			env: { API_TOKEN: 'from-env' },
		});
		await expect(harness.next<string>('token')).resolves.toBe('from-env');
		harness.dispose();
	});
});
