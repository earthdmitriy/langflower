import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { memoryToolsNode } from './node.js';

describe('common-memory-tools', () => {
	it('emits the full memory tool pack', async () => {
		const instance = memoryToolsNode.getInstance();
		const tools = await firstValueFrom(instance.outputs.tools.value$);

		expect(Array.isArray(tools)).toBe(true);
		expect(
			(tools as readonly { toolId: string }[])
				.map((t) => t.toolId)
				.sort(),
		).toEqual(
			[
				'append_memory_log',
				'create_memory_file',
				'get_memory_tree',
				'read_memory_section',
				'search_memory_grep',
				'update_memory_section',
			].sort(),
		);
	});
});
