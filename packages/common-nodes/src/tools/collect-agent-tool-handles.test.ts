import type { ToolHandle } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import { collectAgentToolHandles } from './collect-agent-tool-handles.js';

const handle = (toolId: string, name = toolId): ToolHandle => ({
	toolId,
	name,
	description: name,
	inputSchema: { type: 'object', properties: {} },
	invoke: async () => '',
});

describe('collectAgentToolHandles', () => {
	it('merges toolsPort with toolHandles and last-wins on toolId', () => {
		const portPack = [handle('wired', 'from-port'), handle('keep')];
		const seeded = [handle('wired', 'from-ec'), handle('jsonc-mcp')];

		const merged = collectAgentToolHandles({
			toolHandles: seeded,
			toolsPort: portPack,
		});

		expect(merged.map((tool) => `${tool.toolId}:${tool.name}`)).toEqual([
			'wired:from-ec',
			'keep:keep',
			'jsonc-mcp:jsonc-mcp',
		]);
	});

	it('flattens nested arrays from multi combine', () => {
		const merged = collectAgentToolHandles({
			toolHandles: undefined,
			toolsPort: [[handle('a')], handle('b')],
		});

		expect(merged.map((tool) => tool.toolId)).toEqual(['a', 'b']);
	});

	it('skips non-handle junk in toolsPort', () => {
		const merged = collectAgentToolHandles({
			toolHandles: undefined,
			toolsPort: [[handle('ok')], 'nope', null],
		});

		expect(merged.map((tool) => tool.toolId)).toEqual(['ok']);
	});
});
