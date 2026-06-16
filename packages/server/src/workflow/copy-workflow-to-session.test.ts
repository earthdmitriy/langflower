import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import { copyWorkflowToSession } from './copy-workflow-to-session.js';
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

describe('copyWorkflowToSession', () => {
	let projectDir: string;
	let service: WorkflowService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-wf-copy-'));
		service = new WorkflowService(projectDir, resolveDefinition);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('persists {id}-copy.json and opens it pristine', async () => {
		await service.save({
			workflowId: 'example',
			metadata: {
				name: 'Example',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const session = new LangflowerSession();
		const ok = await copyWorkflowToSession(
			session,
			service,
			projectDir,
			'example',
			resolveDefinition,
		);

		expect(ok).toBe(true);
		expect(session.activeWorkflow?.workflowId).toBe('example-copy');
		expect(session.activeWorkflow?.metadata.name).toBe('Example copy');
		expect(session.currentStatus).toBe('pristine');
		expect(await service.exists('example')).toBe(true);
		expect(await service.exists('example-copy')).toBe(true);
	});

	it('dedups copy ids', async () => {
		await service.save({
			workflowId: 'example',
			metadata: {
				name: 'Example',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});
		await service.save({
			workflowId: 'example-copy',
			metadata: {
				name: 'Example copy',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const session = new LangflowerSession();
		await copyWorkflowToSession(
			session,
			service,
			projectDir,
			'example',
			resolveDefinition,
		);

		expect(session.activeWorkflow?.workflowId).toBe('example-copy-2');
	});
});
