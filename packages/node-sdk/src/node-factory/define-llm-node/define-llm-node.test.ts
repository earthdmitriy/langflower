import { statefulObservable } from '@rx-evo/stateful-observable';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
	defineLlmNode,
	LLM_INVENTORY_INPUT_PORT_IDS,
	LLM_INVENTORY_OUTPUT_PORT_IDS,
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
});
