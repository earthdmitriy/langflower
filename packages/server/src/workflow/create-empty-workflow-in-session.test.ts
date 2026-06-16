import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import { createEmptyWorkflowInSession } from './create-empty-workflow-in-session.js';
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

describe('createEmptyWorkflowInSession', () => {
	let projectDir: string;
	let service: WorkflowService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-wf-create-'));
		service = new WorkflowService(projectDir, resolveDefinition);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('opens an empty dirty Untitled workflow without writing disk', async () => {
		const session = new LangflowerSession();

		const ok = await createEmptyWorkflowInSession(
			session,
			service,
			projectDir,
			resolveDefinition,
		);

		expect(ok).toBe(true);
		expect(session.activeWorkflow?.metadata.name).toBe('Untitled');
		expect(session.activeWorkflow?.workflowId).toBe('untitled');
		expect(session.activeWorkflow?.graph.nodes).toEqual([]);
		expect(session.currentStatus).toBe('dirty');
		expect(await service.exists('untitled')).toBe(false);
	});

	it('allocates a unique id when untitled already exists', async () => {
		await service.save({
			workflowId: 'untitled',
			metadata: {
				name: 'Untitled',
				createdAt: '2026-06-17T00:00:00.000Z',
				updatedAt: '2026-06-17T00:00:00.000Z',
			},
			graph: { viewport: { x: 0, y: 0, scale: 1 }, nodes: [], edges: [] },
		});

		const session = new LangflowerSession();
		await createEmptyWorkflowInSession(
			session,
			service,
			projectDir,
			resolveDefinition,
		);

		expect(session.activeWorkflow?.workflowId).toBe('untitled-2');
	});
});
