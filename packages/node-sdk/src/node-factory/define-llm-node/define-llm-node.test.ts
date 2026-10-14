import { statefulObservable } from '@rx-evo/stateful-observable';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { NodeStateHook, NodeStateJson } from '../../node-state.js';
import {
	defineLlmNode,
	LLM_INVENTORY_INPUT_PORT_IDS,
	LLM_INVENTORY_OUTPUT_PORT_IDS,
	LLM_REQUIRED_CAPABILITIES,
} from './define-llm-node.js';

const idle$ = () =>
	statefulObservable({
		loader: () => of(null),
	});

describe('defineLlmNode', () => {
	it('always installs inventory input and output ports', () => {
		const node = defineLlmNode({
			type: 'test-llm',
			displayName: 'Test LLM',
			category: 'AI',
			uiSchema: [] as const,
			bind(_ctx, { makeInput, configureOutput }, _inventory) {
				const prompt = makeInput<string>('userPrompt', {
					name: 'userPrompt',
					wireType: 'string',
					defaultValue: '',
				});
				const toolLog$ = idle$();
				const recovery$ = idle$();

				return {
					inputs: [prompt],
					outputs: [
						configureOutput('response', toolLog$, {
							wireType: 'string',
						}),
					],
					inventoryOutputs: {
						toolLog$,
						recovery$,
					},
				};
			},
		});

		const inputIds = node.inputsConfigs.map((meta) => String(meta.portId));
		const outputIds = node.outputsConfigs.map((meta) =>
			String(meta.portId),
		);

		for (const portId of LLM_INVENTORY_INPUT_PORT_IDS) {
			expect(inputIds).toContain(portId);
		}

		for (const portId of LLM_INVENTORY_OUTPUT_PORT_IDS) {
			expect(outputIds).toContain(portId);
		}

		expect(inputIds).toContain('userPrompt');
		expect(inputIds).not.toContain('mcp');
		expect(inputIds).not.toContain('subagentRegistration');
		expect(inputIds).not.toContain('subagentResult');
		expect(outputIds).not.toContain('subagent');
		expect(outputIds).toContain('response');

		const steerMeta = node.inputsConfigs.find(
			(meta) => meta.portId === 'steerControl',
		);
		expect(steerMeta?.mode).toBe('single');

		const toolsMeta = node.inputsConfigs.find(
			(meta) => meta.portId === 'tools',
		);
		expect(toolsMeta?.mode).toBe('combine');

		const recoveryMeta = node.outputsConfigs.find(
			(meta) => meta.portId === 'recovery',
		);
		expect(recoveryMeta?.hidden).toBe(true);
		expect(node.requires).toEqual([...LLM_REQUIRED_CAPABILITIES]);
	});

	it('merges author requires with the LLM capability set', () => {
		const node = defineLlmNode({
			type: 'test-llm-extra',
			displayName: 'Test LLM extra',
			requires: ['embed'] as const,
			uiSchema: [] as const,
			bind(_ctx, { makeInput, configureOutput }, _inventory) {
				const prompt = makeInput<string>('userPrompt', {
					name: 'userPrompt',
					wireType: 'string',
					defaultValue: '',
				});
				const stream$ = idle$();
				return {
					inputs: [prompt],
					outputs: [
						configureOutput('response', stream$, {
							wireType: 'string',
						}),
					],
					inventoryOutputs: {
						toolLog$: stream$,
						recovery$: stream$,
					},
				};
			},
		});

		expect(node.requires).toEqual([...LLM_REQUIRED_CAPABILITIES, 'embed']);
	});

	it('rejects redeclared inventory inputs', () => {
		expect(() =>
			defineLlmNode({
				type: 'bad-llm',
				displayName: 'Bad',
				uiSchema: [] as const,
				bind(_ctx, { makeInput }, _inventory) {
					const tools = makeInput('tools', {
						wireType: 'tool-handle',
						defaultValue: [],
					});
					const stream$ = idle$();

					return {
						inputs: [tools],
						outputs: [],
						inventoryOutputs: {
							toolLog$: stream$,
							recovery$: stream$,
						},
					};
				},
			}),
		).toThrow(/do not redeclare inventory inputs/);
	});

	it('forwards state from the inner bind onto the live instance', () => {
		const restored: (NodeStateJson | null)[] = [];
		const hooks: NodeStateHook[] = [];
		const node = defineLlmNode({
			type: 'test-llm-state',
			displayName: 'Test LLM state',
			uiSchema: [] as const,
			bind(_ctx, { configureOutput }, _inventory) {
				const hook: NodeStateHook = {
					persist$: new Subject<NodeStateJson>(),
					restore: (state) => {
						restored.push(state);
						return { ok: true };
					},
				};
				hooks.push(hook);
				const stream$ = idle$();

				return {
					inputs: [],
					outputs: [
						configureOutput('response', stream$, {
							wireType: 'string',
						}),
					],
					inventoryOutputs: {
						toolLog$: stream$,
						recovery$: stream$,
					},
					state: hook,
				};
			},
		});

		expect(hooks).toHaveLength(1);
		expect(restored).toEqual([]);

		const instance = node.getInstance();

		expect(hooks).toHaveLength(2);
		expect(restored).toEqual([]);
		expect(instance.state).toBe(hooks[1]);
	});
});
