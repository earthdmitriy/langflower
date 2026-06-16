import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolveNodeDefinition } from './workflow-document.js';
import { WorkflowService } from './workflow.service.js';

const resolveDefinition: ResolveNodeDefinition = (node) => {
	const definition = resolveWorkflowNodeDefinition({
		type: node.type,
	});

	if (definition === undefined) {
		return undefined;
	}

	return definition;
};

describe('WorkflowService.list', () => {
	let projectDir: string;
	let service: WorkflowService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-wf-list-'));
		service = new WorkflowService(projectDir, resolveDefinition);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns saved workflows', async () => {
		await service.save({
			workflowId: 'untitled',
			metadata: {
				name: 'untitled',
				createdAt: '2026-06-24T22:13:29.313Z',
				updatedAt: '2026-06-24T22:13:30.444Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const workflows = await service.list();

		expect(workflows.some((entry) => entry.workflowId === 'untitled')).toBe(
			true,
		);
	});

	it('writes workflow JSON with tab indentation', async () => {
		await service.save({
			workflowId: 'indent-check',
			metadata: {
				name: 'indent-check',
				createdAt: '2026-06-24T22:13:29.313Z',
				updatedAt: '2026-06-24T22:13:30.444Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const raw = await fs.readFile(
			path.join(
				projectDir,
				'.langflower',
				'workflows',
				'indent-check.json',
			),
			'utf8',
		);

		expect(raw.startsWith('{\n\t"metadata"')).toBe(true);
		expect(raw.includes('\n  "')).toBe(false);
	});

	it('uses the filename stem as workflowId; ignores legacy metadata.id', async () => {
		const workflowsDir = path.join(projectDir, '.langflower', 'workflows');
		await fs.mkdir(workflowsDir, { recursive: true });
		await fs.writeFile(
			path.join(workflowsDir, 'fake-llm-copy.json'),
			`${JSON.stringify(
				{
					metadata: {
						id: 'fake-llm',
						name: 'Fake-LLM copy',
						createdAt: '2026-07-23T00:00:00.000Z',
						updatedAt: '2026-07-23T00:00:00.000Z',
					},
					graph: {
						viewport: { x: 0, y: 0, scale: 1 },
						nodes: [],
						edges: [],
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		const workflows = await service.list();
		expect(
			workflows.some((entry) => entry.workflowId === 'fake-llm-copy'),
		).toBe(true);
		expect(workflows.some((entry) => entry.workflowId === 'fake-llm')).toBe(
			false,
		);

		const loaded = await service.load({ workflowId: 'fake-llm-copy' });
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.document.workflowId).toBe('fake-llm-copy');
			expect(loaded.repaired).toBe(false);
		}
	});

	it('repairs unknown node types instead of rejecting load', async () => {
		const workflowsDir = path.join(projectDir, '.langflower', 'workflows');
		await fs.mkdir(workflowsDir, { recursive: true });
		await fs.writeFile(
			path.join(workflowsDir, 'broken-hitl.json'),
			`${JSON.stringify(
				{
					metadata: {
						name: 'Broken HITL',
						createdAt: '2026-07-29T00:00:00.000Z',
						updatedAt: '2026-07-29T00:00:00.000Z',
					},
					graph: {
						viewport: { x: 0, y: 0, scale: 1 },
						nodes: [
							{
								id: 'chat',
								type: 'common-chat-input',
								params: {},
								inputs: {},
								ui: { position: { x: 0, y: 0 } },
							},
							{
								id: 'helper',
								type: 'common-openai-llm',
								params: {},
								inputs: {},
								ui: { position: { x: 100, y: 0 } },
							},
							{
								id: 'clarify',
								type: 'common-hitl',
								params: {},
								inputs: {},
								ui: { position: { x: 200, y: 0 } },
							},
						],
						edges: [
							{
								edgeId: 'e-chat-helper',
								fromNodeId: 'chat',
								fromPort: ['message', 0],
								toNodeId: 'helper',
								toPort: ['userPrompt', 0],
							},
							{
								edgeId: 'e-helper-clarify',
								fromNodeId: 'helper',
								fromPort: ['response', 0],
								toNodeId: 'clarify',
								toPort: ['trigger', 0],
							},
						],
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		const loaded = await service.load({ workflowId: 'broken-hitl' });
		expect(loaded.ok).toBe(true);
		if (loaded.ok) {
			expect(loaded.repaired).toBe(true);
			expect(loaded.droppedNodeIds).toEqual(['clarify']);
			expect(loaded.droppedEdgeIds).toEqual(['e-helper-clarify']);
			expect(loaded.document.graph.nodes.map((node) => node.id)).toEqual([
				'chat',
				'helper',
			]);
			expect(
				loaded.document.graph.edges.map((edge) => edge.edgeId),
			).toEqual(['e-chat-helper']);
		}
	});

	it('does not persist metadata.id on disk', async () => {
		await service.save({
			workflowId: 'no-id-on-disk',
			metadata: {
				name: 'No id on disk',
				createdAt: '2026-06-24T22:13:29.313Z',
				updatedAt: '2026-06-24T22:13:30.444Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const raw = await fs.readFile(
			path.join(
				projectDir,
				'.langflower',
				'workflows',
				'no-id-on-disk.json',
			),
			'utf8',
		);
		const parsed = JSON.parse(raw) as {
			metadata: { id?: string; name: string };
		};
		expect(parsed.metadata.id).toBeUndefined();
		expect(parsed.metadata.name).toBe('No id on disk');
	});

	it('preserves top-level $schema across save', async () => {
		const workflowsDir = path.join(projectDir, '.langflower', 'workflows');
		await fs.mkdir(workflowsDir, { recursive: true });
		await fs.writeFile(
			path.join(workflowsDir, 'with-schema.json'),
			`${JSON.stringify(
				{
					$schema: '../schemas/workflow.schema.json',
					metadata: {
						name: 'With schema',
						createdAt: '2026-06-24T22:13:29.313Z',
						updatedAt: '2026-06-24T22:13:30.444Z',
					},
					graph: {
						viewport: { x: 0, y: 0, scale: 1 },
						nodes: [],
						edges: [],
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await service.save({
			workflowId: 'with-schema',
			metadata: {
				name: 'With schema renamed',
				createdAt: '2026-06-24T22:13:29.313Z',
				updatedAt: '2026-06-24T22:13:31.000Z',
			},
			graph: { viewport: { x: 1, y: 2, scale: 1 }, nodes: [], edges: [] },
		});

		const raw = JSON.parse(
			await fs.readFile(
				path.join(workflowsDir, 'with-schema.json'),
				'utf8',
			),
		) as {
			$schema?: string;
			metadata: { name: string };
		};

		expect(raw.$schema).toBe('../schemas/workflow.schema.json');
		expect(raw.metadata.name).toBe('With schema renamed');
	});

	it('skips corrupt workflow files instead of returning an empty catalog', async () => {
		const workflowsDir = path.join(projectDir, '.langflower', 'workflows');
		await fs.mkdir(workflowsDir, { recursive: true });
		await fs.writeFile(
			path.join(workflowsDir, 'broken.json'),
			'not json',
			'utf8',
		);

		await service.save({
			workflowId: 'untitled',
			metadata: {
				name: 'untitled',
				createdAt: '2026-06-24T22:13:29.313Z',
				updatedAt: '2026-06-24T22:13:30.444Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const workflows = await service.list();

		expect(workflows.some((entry) => entry.workflowId === 'untitled')).toBe(
			true,
		);
	});
});
