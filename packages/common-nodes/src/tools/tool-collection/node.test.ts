import type { ToolHandle } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import { firstValueFrom, of } from 'rxjs';
import { getCommonReactiveNode } from '../../catalog.js';
import { toolCollectionNode } from './node.js';

const handle = (toolId: string, name = toolId): ToolHandle => ({
	toolId,
	name,
	description: name,
	inputSchema: { type: 'object', properties: {} },
	invoke: async () => '',
});

const waitTools = (
	instance: ReturnType<typeof toolCollectionNode.getInstance>,
) => firstValueFrom(instance.outputs.tools.value$);

describe('common-tool-collection', () => {
	it('registers in the Tools catalog', () => {
		const node = getCommonReactiveNode('common-tool-collection');

		expect(node).toBeDefined();
		expect(node?.displayName).toBe('Tool collection');
		expect(node?.category).toBe('Tools');
		expect(node?.getInstance).toBeTypeOf('function');
	});

	it('emits [] when unwired / empty', async () => {
		const instance = toolCollectionNode.getInstance();
		instance.inputs.tools.connect(of([]));

		await expect(waitTools(instance)).resolves.toEqual([]);
	});

	it('flattens combined packs into one ToolHandle[]', async () => {
		const instance = toolCollectionNode.getInstance();
		instance.inputs.tools.connect(
			of([[handle('a')], [handle('b')], handle('c')]),
		);

		const tools = await waitTools(instance);
		expect(tools.map((tool) => tool.toolId)).toEqual(['a', 'b', 'c']);
	});

	it('last-wins on duplicate toolId (later slot)', async () => {
		const instance = toolCollectionNode.getInstance();
		instance.inputs.tools.connect(
			of([
				[handle('dup', 'first'), handle('keep')],
				[handle('dup', 'second')],
			]),
		);

		const tools = await waitTools(instance);
		expect(tools.map((tool) => `${tool.toolId}:${tool.name}`)).toEqual([
			'dup:second',
			'keep:keep',
		]);
	});

	it('skips junk values without throwing', async () => {
		const instance = toolCollectionNode.getInstance();
		instance.inputs.tools.connect(
			of([[handle('ok')], 'nope', null, 12, { toolId: 'fake' }]),
		);

		const tools = await waitTools(instance);
		expect(tools.map((tool) => tool.toolId)).toEqual(['ok']);
	});

	it('exposes tools in (combine) and tools out', () => {
		const inputIds = toolCollectionNode.inputsConfigs.map((meta) =>
			String(meta.portId),
		);
		const outputIds = toolCollectionNode.outputsConfigs.map((meta) =>
			String(meta.portId),
		);
		const toolsIn = toolCollectionNode.inputsConfigs.find(
			(meta) => meta.portId === 'tools',
		);

		expect(inputIds).toContain('tools');
		expect(outputIds).toEqual(['tools']);
		expect(toolsIn?.mode).toBe('combine');
		expect(toolsIn?.wireType).toBe('tool-handle');
	});
});
