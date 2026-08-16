import type { ToolHandle } from '@langflower/node-sdk';
import { describe, expect, it } from 'vitest';
import {
	buildAgentToolCtx,
	getRunHostServices,
} from '../ai/features/run-host-services.js';
import { invokeInventoryTool } from './inventory-tool-round.js';

describe('invokeInventoryTool host bag', () => {
	it('does not put RunHostServices on agent toolCtx', async () => {
		const requestLangflowerBus = async () => ({ status: 'ok' });
		const toolCtx = buildAgentToolCtx(
			{ projectDir: '/tmp/p', runId: 'run-1' },
			{
				getLiveWiredTools: () => [],
				requestLangflowerBus,
			},
		);
		const tools: readonly ToolHandle[] = [
			{
				toolId: 'probe_host',
				name: 'probe_host',
				description: 'probe',
				inputSchema: { type: 'object', properties: {} },
				invoke: async (_args, ctx) => {
					const bag = getRunHostServices(ctx);
					return bag === undefined ? 'clean' : 'leaked';
				},
			},
		];

		const result = await invokeInventoryTool(
			undefined,
			tools,
			{
				id: 'call-1',
				name: 'probe_host',
				arguments: '{}',
			},
			toolCtx,
			{ signal: new AbortController().signal },
		);

		expect(getRunHostServices(toolCtx)).toBeUndefined();
		expect(result).toEqual({ ok: true, text: 'clean' });
	});
});
