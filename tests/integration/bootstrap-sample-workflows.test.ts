import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bootstrapProject } from '@langflower/server/bootstrap';
import {
	createTempProject,
	removeTempProject,
} from './helpers/temp-project.js';

const SKELETON_WORKFLOW_FILES = [
	'agents-dialog.json',
	'advanced-coder.json',
	'kb-create.json',
	'kb-navigate.json',
	'node-writer.json',
	'simple-coder.json',
	'starter.json',
] as const;

describe('project bootstrap (integration)', () => {
	it('seeds all skeleton workflows when .langflower is created', async () => {
		const projectDir = await createTempProject();

		try {
			const workflowsDir = path.join(
				projectDir,
				'.langflower',
				'workflows',
			);
			const files = await fs.readdir(workflowsDir);

			for (const fileName of SKELETON_WORKFLOW_FILES) {
				expect(files).toContain(fileName);
			}
			expect(files).toContain('example.json');
			expect(files).not.toContain('example-missing.json');

			const raw = await fs.readFile(
				path.join(workflowsDir, 'starter.json'),
				'utf8',
			);
			const document = JSON.parse(raw) as {
				metadata: { name: string; id?: string };
				graph: { nodes: readonly { type: string; params?: unknown }[] };
			};

			expect(document.metadata.name).toBe('Starter');
			expect(document.metadata.id).toBeUndefined();
			expect(
				document.graph.nodes.some(
					(node) => node.type === 'common-chat-input',
				),
			).toBe(true);
			expect(
				document.graph.nodes.some((node) => {
					const params = node.params as
						{ skillId?: string } | undefined;
					return (
						node.type === 'common-openai-llm' &&
						params?.skillId === 'langflower-helper'
					);
				}),
			).toBe(true);
		} finally {
			await removeTempProject(projectDir);
		}
	});

	it('seeds currentWorkflowId starter in langflower.jsonc', async () => {
		const projectDir = await createTempProject();

		try {
			const raw = await fs.readFile(
				path.join(projectDir, '.langflower', 'langflower.jsonc'),
				'utf8',
			);
			const config = JSON.parse(raw) as { currentWorkflowId?: string };

			expect(config.currentWorkflowId).toBe('starter');
		} finally {
			await removeTempProject(projectDir);
		}
	});

	it('does not overwrite existing starter workflow on create mode', async () => {
		const projectDir = await createTempProject();

		try {
			const starterPath = path.join(
				projectDir,
				'.langflower',
				'workflows',
				'starter.json',
			);
			const marker = '{"metadata":{"id":"custom-starter"}}';

			await fs.writeFile(starterPath, marker, 'utf8');
			await bootstrapProject(projectDir, { mode: 'create' });

			const raw = await fs.readFile(starterPath, 'utf8');
			expect(raw).toBe(marker);
		} finally {
			await removeTempProject(projectDir);
		}
	});

	it('force mode overwrites skeleton workflows and preserves langflower.jsonc', async () => {
		const projectDir = await createTempProject();

		try {
			const langflowerDir = path.join(projectDir, '.langflower');
			const starterPath = path.join(
				langflowerDir,
				'workflows',
				'starter.json',
			);
			const configPath = path.join(langflowerDir, 'langflower.jsonc');
			const marker = {
				currentWorkflowId: 'starter',
				provider: { openai: { apiKey: 'keep-me' } },
			};

			await fs.writeFile(
				starterPath,
				'{"metadata":{"name":"stale"}}\n',
				'utf8',
			);
			await fs.writeFile(
				configPath,
				`${JSON.stringify(marker, null, 2)}\n`,
				'utf8',
			);

			await bootstrapProject(projectDir, { mode: 'force' });

			const starter = JSON.parse(
				await fs.readFile(starterPath, 'utf8'),
			) as {
				metadata: { name: string };
			};
			expect(starter.metadata.name).toBe('Starter');
			expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual(
				marker,
			);
		} finally {
			await removeTempProject(projectDir);
		}
	});

	it('seeds my-nodes and onboarding skills from skeleton', async () => {
		const projectDir = await createTempProject({ seedCustomNodes: true });

		try {
			const myNodes = path.join(
				projectDir,
				'.langflower',
				'nodes',
				'my-nodes',
			);
			const files = await fs.readdir(myNodes);
			expect(files).toEqual(
				expect.arrayContaining([
					'package.json',
					'tsconfig.json',
					'README.md',
					'git-diff.ts',
				]),
			);

			await expect(
				fs.stat(
					path.join(
						projectDir,
						'.langflower',
						'skills',
						'langflower-helper',
						'SKILL.md',
					),
				),
			).resolves.toBeDefined();
		} finally {
			await removeTempProject(projectDir);
		}
	});
});
