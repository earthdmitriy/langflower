import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { NodeId } from '@langflower/runtime';
import { describe, expect, it } from 'vitest';
import { firstValueFrom, timeout } from 'rxjs';
import { LangflowerSession } from '../session/langflower-session.js';
import { bindWorkflowToSessionEditor } from './apply-editor-mutation.js';
import type { ResolveNodeDefinition } from './workflow-document.js';

const resolveDefinition: ResolveNodeDefinition = (node) =>
	resolveWorkflowNodeDefinition({ type: node.type });

/**
 * ADR-028: persisted `inputs: {}` must still materialize current definition
 * defaults so LLM `combineInputs` is not starved.
 */
describe('materialize empty Fake LLM inputs', () => {
	it('connects current definition defaults when inputs are empty', async () => {
		const session = new LangflowerSession();
		const bind = bindWorkflowToSessionEditor(
			session.runtime.editor,
			process.cwd(),
			{
				workflowId: 'empty-inputs-fake-llm',
				metadata: {
					name: 'empty-inputs-fake-llm',
					createdAt: '2026-07-23T00:00:00.000Z',
					updatedAt: '2026-07-23T00:00:00.000Z',
				},
				graph: {
					viewport: { x: 0, y: 0, scale: 1 },
					nodes: [
						{
							id: 'llm-1',
							type: 'common-fake-llm',
							params: { tokenDelayMs: 0 },
							inputs: {},
							ui: { position: { x: 0, y: 0 } },
						},
					],
					edges: [],
				},
			},
			resolveDefinition,
		);
		expect(bind.ok).toBe(true);

		const llm = session.runtime.editor.getNode('llm-1' as NodeId);
		expect(llm).not.toBe(false);
		if (llm === false) {
			return;
		}

		await expect(
			firstValueFrom(llm.inputs['tools']!.pipe(timeout(500))),
		).resolves.toEqual([]);
		await expect(
			firstValueFrom(llm.inputs['systemPrompt']!.pipe(timeout(500))),
		).resolves.toBe('');
	});
});
