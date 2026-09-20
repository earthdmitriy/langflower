import { describe, expect, it } from 'vitest';
import { getCommonReactiveNode } from './catalog.js';
import { resolveWorkflowNodeDefinition } from './resolve-workflow-node-definition.js';

describe('resolveWorkflowNodeDefinition', () => {
	it('resolves a catalog type regardless of params', () => {
		const empty = resolveWorkflowNodeDefinition({
			type: 'common-string',
			params: {},
		});
		const withParams = resolveWorkflowNodeDefinition({
			type: 'common-string',
			params: { unused: true },
		});

		expect(empty).toBe(getCommonReactiveNode('common-string'));
		expect(withParams).toBe(empty);
	});

	it('returns undefined for an unknown type', () => {
		expect(
			resolveWorkflowNodeDefinition({
				type: 'not-a-node',
				params: {},
			}),
		).toBeUndefined();
	});
});
