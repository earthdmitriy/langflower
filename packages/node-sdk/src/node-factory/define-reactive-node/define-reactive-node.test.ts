import { statefulObservable } from '@rx-evo/stateful-observable';
import { firstValueFrom, map, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MULTILINE_MIN_HEIGHT_PX,
	defineReactiveNode,
	resolveMultilineInlineLayout,
} from './define-reactive-node.js';

describe('defineReactiveNode', () => {
	it('registers bind() port descriptors for the catalog', () => {
		const node = defineReactiveNode({
			type: 'test-bind-probe',
			displayName: 'Probe',
			uiSchema: [] as const,
			bind(_ctx, { makeInput, configureOutput }) {
				const value = makeInput<string>('value', {
					name: 'value',
					required: true,
				});

				return {
					inputs: [value],
					outputs: [
						configureOutput(
							'out',
							statefulObservable({ loader: () => of('ok') }),
							{ wireType: 'string' },
						),
					],
				};
			},
		});

		expect(node.inputsConfigs).toHaveLength(2);
		expect(node.inputsConfigs[1]?.name).toBe('value');
		expect(node.outputsConfigs[0]).toEqual({
			wireType: 'string',
			portId: 'out',
			dir: 'out',
		});
	});

	it('infers params from uiSchema as const', () => {
		const node = defineReactiveNode({
			type: 'test-params',
			displayName: 'Params',
			uiSchema: [
				{ field: 'mode', type: 'string', default: 'fast' },
			] as const,
			bind(ctx, { configureOutput }) {
				const mode$ = ctx.pipeValue(
					map((ec) => String(ec.params?.mode ?? 'fast')),
				);

				return {
					inputs: [],
					outputs: [
						configureOutput('mode', mode$, {
							wireType: 'string',
						}),
					],
				};
			},
		});

		expect(node.uiSchema).toEqual([
			{ field: 'mode', type: 'string', default: 'fast' },
		]);
	});

	it('returns catalog metadata without bind', () => {
		const node = defineReactiveNode({
			type: 'test-extract',
			displayName: 'Extract',
			category: 'Test',
			uiSchema: [] as const,
			bind() {
				return { inputs: [], outputs: [] };
			},
		});

		expect('bind' in node).toBe(false);
		expect(node.type).toBe('test-extract');
		expect(node.displayName).toBe('Extract');
		expect(node.category).toBe('Test');
		expect(node.inputsConfigs).toEqual([
			{
				portId: expect.anything(),
				dir: 'in',
				name: 'context',
				hidden: true,
				wireType: expect.anything(),
				mode: 'single',
			},
		]);
		expect(node.outputsConfigs).toEqual([]);
		expect(node.uiSchema).toEqual([]);
	});

	it('declares multi inputs from runtime port metadata', () => {
		const node = defineReactiveNode({
			type: 'test-multi',
			displayName: 'Multi',
			uiSchema: [] as const,
			bind(_ctx, { makeInput, configureOutput, combineInputs }) {
				const lines = makeInput<readonly unknown[]>('lines', {
					name: 'lines',
					multi: 'merge',
					required: true,
				});
				const text$ = lines.pipeValue(
					map((values) =>
						(values[0] as readonly unknown[])
							.map((line) => String(line ?? ''))
							.join(''),
					),
				);

				return {
					inputs: [lines],
					outputs: [
						configureOutput('text', text$, {
							wireType: 'string',
						}),
					],
				};
			},
		});

		expect(node.inputsConfigs[1]?.multi).toBe('merge');
		expect(node.getInstance().outputs.text).toBeDefined();
	});

	it('marked hitl input receives value via input connection', async () => {
		const node = defineReactiveNode({
			type: 'test-hitl-input',
			displayName: 'HITL Input',
			uiSchema: [] as const,
			bind(_ctx, { makeInput, configureOutput }) {
				const reply = makeInput<string>('reply', {
					name: 'reply',
					wireType: 'string',
					required: true,
					hitl: {
						title: 'Reply',
						kind: 'textarea',
						submitLabel: 'Send',
					},
				});

				return {
					inputs: [reply],
					outputs: [
						configureOutput('out', reply, {
							wireType: 'string',
						}),
					],
				};
			},
		});

		expect(node.inputsConfigs[1]?.hitl).toEqual({
			title: 'Reply',
			kind: 'textarea',
			submitLabel: 'Send',
		});

		const first = node.getInstance();
		const second = node.getInstance();

		expect(first.inputs.reply).not.toBe(second.inputs.reply);
		expect(first.outputs.out).not.toBe(second.outputs.out);

		first.inputs.reply.connect(of('first'));
		second.inputs.reply.connect(of('second'));

		await expect(firstValueFrom(first.outputs.out.value$)).resolves.toBe(
			'first',
		);
		await expect(firstValueFrom(second.outputs.out.value$)).resolves.toBe(
			'second',
		);
	});

	it('creates a fresh runtime instance via getInstance()', () => {
		const node = defineReactiveNode({
			type: 'test-materialize',
			displayName: 'Materialize',
			uiSchema: [
				{ field: 'value', type: 'string', default: 'default' },
			] as const,
			bind(ctx, { configureOutput }) {
				const value$ = ctx.pipeValue(
					map((ec) =>
						typeof ec.params?.value === 'string'
							? ec.params.value
							: '',
					),
				);

				return {
					inputs: [],
					outputs: [
						configureOutput('value', value$, {
							wireType: 'string',
						}),
					],
				};
			},
		});

		const instance = node.getInstance();

		expect(instance.outputs.value).toBeDefined();
	});
});

describe('resolveMultilineInlineLayout', () => {
	it('maps shorthand text-multiline to flex 1 and default min height', () => {
		expect(resolveMultilineInlineLayout('text-multiline')).toEqual({
			flex: 1,
			minHeightPx: DEFAULT_MULTILINE_MIN_HEIGHT_PX,
		});
	});

	it('honors explicit flex and minHeightPx', () => {
		expect(
			resolveMultilineInlineLayout({
				type: 'text-multiline',
				flex: 2,
				minHeightPx: 160,
			}),
		).toEqual({ flex: 2, minHeightPx: 160 });
	});

	it('treats flex 0 as no grow (still returns layout)', () => {
		expect(
			resolveMultilineInlineLayout({
				type: 'text-multiline',
				flex: 0,
			}),
		).toEqual({ flex: 0, minHeightPx: DEFAULT_MULTILINE_MIN_HEIGHT_PX });
	});

	it('returns null for non-multiline kinds', () => {
		expect(resolveMultilineInlineLayout('text')).toBeNull();
		expect(resolveMultilineInlineLayout('boolean')).toBeNull();
	});
});
