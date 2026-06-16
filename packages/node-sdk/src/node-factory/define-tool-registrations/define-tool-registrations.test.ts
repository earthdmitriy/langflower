import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { defineToolRegistrations } from './define-tool-registrations.js';
import type { ToolHandle } from './tool-handle.js';

describe('defineToolRegistrations', () => {
	it('emits ToolHandle[] with invoke (no kind/handler)', async () => {
		const node = defineToolRegistrations({
			type: 'test-memory-tools',
			displayName: 'Memory Tools',
			category: 'Memory',
			tools: [
				{
					toolId: 'get_memory_tree',
					description: 'get',
					inputSchema: { type: 'object' },
					handler: async () => JSON.stringify({ files: [] }),
				},
			],
		});

		expect(node.type).toBe('test-memory-tools');

		const instance = node.getInstance();
		const tools = (await firstValueFrom(
			instance.outputs.tools.value$,
		)) as readonly ToolHandle[];
		const handle = tools[0];

		expect(handle?.toolId).toBe('get_memory_tree');
		expect(typeof handle?.invoke).toBe('function');
		expect(Object.prototype.hasOwnProperty.call(handle ?? {}, 'kind')).toBe(
			false,
		);
		expect(
			Object.prototype.hasOwnProperty.call(handle ?? {}, 'handler'),
		).toBe(false);

		const text = await handle!.invoke(
			{},
			{ projectDir: '/tmp', runId: 'r' },
		);
		expect(text).toContain('"files"');
	});
});
