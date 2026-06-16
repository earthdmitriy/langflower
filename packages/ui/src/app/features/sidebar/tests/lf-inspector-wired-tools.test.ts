import type { EdgeId, NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import {
	displayEnabledToolIds,
	resolveWiredToolOptions,
} from '@langflower/shared/langflower';

describe('lf-inspector wired tool options', () => {
	it('resolves wired tool options with name and description for Inspector multiselect', () => {
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

	it('shows all wired tool ids as checked when allowlist is unset', () => {
		expect(displayEnabledToolIds(undefined, ['grep', 'read_file'])).toEqual(
			['grep', 'read_file'],
		);
	});
});
