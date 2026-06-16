import { resolveWorkflowNodeDefinition } from '@langflower/common-nodes';
import type { WorkflowLoadedPayload } from '@langflower/shared/langflower.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerSession } from '../session/langflower-session.js';
import { renameActiveWorkflow } from './rename-active-workflow.js';
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

const emptyDocument = (
	id: string,
	name: string,
	inputsValue?: string,
): WorkflowLoadedPayload => ({
	workflowId: id,
	metadata: {
		name,
		createdAt: '2026-06-17T00:00:00.000Z',
		updatedAt: '2026-06-17T00:00:00.000Z',
	},
	graph: {
		viewport: { x: 0, y: 0, scale: 1 },
		nodes:
			inputsValue === undefined
				? []
				: [
						{
							id: 'string-1',
							type: 'common-string',
							params: {},
							inputs: { value: inputsValue },
							ui: {
								position: { x: 0, y: 0 },
								label: 'String',
							},
						},
					],
		edges: [],
	},
});

describe('renameActiveWorkflow', () => {
	let projectDir: string;
	let service: WorkflowService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-wf-rename-'));
		service = new WorkflowService(projectDir, resolveDefinition);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns null when no active workflow', async () => {
		const session = new LangflowerSession();

		expect(await renameActiveWorkflow(session, service, 'Next')).toBeNull();
	});

	it('renames identity on disk without committing dirty graph edits', async () => {
		await service.save(emptyDocument('demo', 'Demo', 'on-disk'));

		const session = new LangflowerSession();
		session.activeWorkflow = emptyDocument('demo', 'Demo', 'in-memory');
		session.activeWorkflowId = 'demo';
		session.markDirty();

		const renamed = await renameActiveWorkflow(
			session,
			service,
			'Renamed Flow',
		);

		expect(renamed?.document.metadata.name).toBe('Renamed Flow');
		expect(renamed?.document.workflowId).toBe('renamed-flow');
		expect(renamed?.catalogChanged).toBe(true);
		expect(session.currentStatus).toBe('dirty');
		expect(session.pendingPreviousId).toBeUndefined();
		expect(session.activeWorkflow?.graph.nodes[0]?.inputs.value).toBe(
			'in-memory',
		);

		expect(await service.exists('demo')).toBe(false);
		const disk = await service.load({ workflowId: 'renamed-flow' });
		expect(disk.ok).toBe(true);
		if (disk.ok) {
			expect(disk.document.metadata.name).toBe('Renamed Flow');
			expect(disk.document.graph.nodes[0]?.inputs.value).toBe('on-disk');
		}
	});

	it('updates session only when file was never saved', async () => {
		const session = new LangflowerSession();
		session.activeWorkflow = emptyDocument('untitled', 'Untitled');
		session.activeWorkflowId = 'untitled';
		session.markDirty();

		const renamed = await renameActiveWorkflow(
			session,
			service,
			'Fresh Name',
		);

		expect(renamed?.catalogChanged).toBe(false);
		expect(session.activeWorkflow?.workflowId).toBe('fresh-name');
		expect(session.currentStatus).toBe('dirty');
		expect(await service.exists('fresh-name')).toBe(false);
	});

	it('preserves pristine when renaming a saved workflow', async () => {
		await service.save(emptyDocument('demo', 'Demo'));

		const session = new LangflowerSession();
		session.activeWorkflow = emptyDocument('demo', 'Demo');
		session.activeWorkflowId = 'demo';

		const renamed = await renameActiveWorkflow(
			session,
			service,
			'Renamed Flow',
		);

		expect(renamed?.catalogChanged).toBe(true);
		expect(session.currentStatus).toBe('pristine');
	});

	it('ignores blank names and target id collisions', async () => {
		await service.save(emptyDocument('demo', 'Demo'));
		await service.save(emptyDocument('taken', 'Taken'));

		const session = new LangflowerSession();
		session.activeWorkflow = emptyDocument('demo', 'Demo');
		session.activeWorkflowId = 'demo';

		expect(await renameActiveWorkflow(session, service, '   ')).toBeNull();
		expect(
			await renameActiveWorkflow(session, service, 'Taken'),
		).toBeNull();
		expect(session.activeWorkflow?.workflowId).toBe('demo');
	});
});
