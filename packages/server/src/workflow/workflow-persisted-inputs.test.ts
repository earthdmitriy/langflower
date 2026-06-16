import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import { describe, expect, it } from 'vitest';
import type { ResolveNodeDefinition } from './workflow-document.js';
import {
	normalizeWorkflowDocumentInputs,
	prunePersistedInputs,
} from './workflow-persisted-inputs.js';

const resolveDefinition: ResolveNodeDefinition = (node) =>
	resolveWorkflowNodeDefinition({ type: node.type });

describe('prunePersistedInputs', () => {
	it('keeps visible overrides that differ from defaultValue', () => {
		const definition = resolveDefinition({
			type: 'common-string',
			params: {},
		});
		expect(definition).toBeDefined();
		expect(prunePersistedInputs({ value: 'Hello' }, definition!)).toEqual({
			value: 'Hello',
		});
	});

	it('strips values equal to defaultValue', () => {
		const definition = resolveDefinition({
			type: 'common-string',
			params: {},
		});
		expect(prunePersistedInputs({ value: '' }, definition!)).toEqual({});
	});

	it('strips wire-only LLM inventory defaults', () => {
		const definition = resolveDefinition({
			type: 'common-fake-llm',
			params: {},
		});
		expect(
			prunePersistedInputs(
				{
					systemPrompt: '',
					feedback: '',
					tools: [],
					mcp: [],
					subagentRegistration: [],
					subagentResult: null,
				},
				definition!,
			),
		).toEqual({});
	});

	it('keeps visible systemPrompt when non-default', () => {
		const definition = resolveDefinition({
			type: 'common-fake-llm',
			params: {},
		});
		expect(
			prunePersistedInputs(
				{ systemPrompt: 'Be brief', tools: [] },
				definition!,
			),
		).toEqual({ systemPrompt: 'Be brief' });
	});
});

describe('normalizeWorkflowDocumentInputs', () => {
	it('strips baked defaults from every node', () => {
		const document = normalizeWorkflowDocumentInputs(
			{
				workflowId: 'wf',
				metadata: {
					name: 'wf',
					createdAt: '2026-07-23T00:00:00.000Z',
					updatedAt: '2026-07-23T00:00:00.000Z',
				},
				graph: {
					viewport: { x: 0, y: 0, scale: 1 },
					nodes: [
						{
							id: 's1',
							type: 'common-string',
							params: {},
							inputs: { value: '' },
							ui: { position: { x: 0, y: 0 } },
						},
						{
							id: 'llm1',
							type: 'common-fake-llm',
							params: { tokenDelayMs: 40 },
							inputs: {
								systemPrompt: '',
								tools: [],
								mcp: [],
							},
							ui: { position: { x: 1, y: 0 } },
						},
					],
					edges: [],
				},
			},
			resolveDefinition,
		);

		expect(document.graph.nodes[0]?.inputs).toEqual({});
		expect(document.graph.nodes[1]?.inputs).toEqual({});
	});
});
