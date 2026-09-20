import type { EdgeId, NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { resolveWiredToolOptions } from '@langflower/shared/langflower-config/resolve-wired-tool-options';

describe('lf-inspector wired tool options', () => {
	it('resolves wired tool options with name and description for the permission table', () => {
		const options = resolveWiredToolOptions(
			{
				nodes: [
					{
						id: 'tool-grep',
						type: 'author-tool-registration',
						params: {},
						inputs: {
							toolId: 'grep',
							name: 'grep',
							description: 'search files',
						},
						ui: { position: { x: 0, y: 0 } },
					},
					{
						id: 'llm-1',
						type: 'common-fake-llm',
						params: {},
						inputs: {},
						ui: { position: { x: 280, y: 0 } },
					},
				],
				edges: [
					{
						edgeId: 'e1' as EdgeId,
						fromNodeId: 'tool-grep' as NodeId,
						fromPort: ['toolRegistration', 0],
						toNodeId: 'llm-1' as NodeId,
						toPort: ['tools', 0],
					},
				],
			},
			'llm-1',
		);

		expect(options).toEqual([
			{
				value: 'grep',
				title: 'grep',
				description: 'search files',
			},
		]);
	});
});
