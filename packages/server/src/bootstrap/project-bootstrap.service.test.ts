import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	bootstrapProject,
	hasLangflowerProject,
} from './project-bootstrap.service.js';

const readUtf8 = async (filePath: string): Promise<string> =>
	fs.readFile(filePath, 'utf8');

const SKELETON_WORKFLOW_IDS = [
	'agents-dialog',
	'advanced-coder',
	'kb-create',
	'kb-ingest',
	'kb-manual-search',
	'kb-navigate',
	'kb-rag',
	'kb-tool',
	'node-writer',
	'simple-coder',
	'starter',
] as const;

describe('bootstrapProject', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-bootstrap-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('creates .langflower/skills/ on new projects', async () => {
		await bootstrapProject(projectDir);

		const stat = await fs.stat(
			path.join(projectDir, '.langflower', 'skills'),
		);

		expect(stat.isDirectory()).toBe(true);
		expect(await hasLangflowerProject(projectDir)).toBe(true);
	});

	it('skips my-nodes when seedCustomNodes is false', async () => {
		await bootstrapProject(projectDir, { seedCustomNodes: false });

		const nodesDir = path.join(projectDir, '.langflower', 'nodes');
		const entries = await fs.readdir(nodesDir);

		expect(entries).not.toContain('my-nodes');
		expect(entries).not.toContain('hello-embed');
		expect(
			(
				await fs.stat(
					path.join(projectDir, '.langflower', 'instructions.md'),
				)
			).isFile(),
		).toBe(true);
	});

	it('seeds my-nodes pack, instructions, skills, and all skeleton workflows', async () => {
		const result = await bootstrapProject(projectDir);

		const langflowerDir = path.join(projectDir, '.langflower');
		const myNodes = path.join(langflowerDir, 'nodes', 'my-nodes');
		const helloEmbed = path.join(langflowerDir, 'nodes', 'hello-embed');

		for (const name of [
			'package.json',
			'tsconfig.json',
			'README.md',
			'git-diff.ts',
			'review-gate.ts',
		]) {
			const stat = await fs.stat(path.join(myNodes, name));
			expect(stat.isFile()).toBe(true);
		}

		for (const name of [
			'package.json',
			'ingest.ts',
			'search.ts',
			'search-handle.ts',
		]) {
			const stat = await fs.stat(path.join(helloEmbed, name));
			expect(stat.isFile()).toBe(true);
		}

		const gitDiff = await readUtf8(path.join(myNodes, 'git-diff.ts'));
		expect(gitDiff).toContain('export default defineNode');

		expect(
			(
				await fs.stat(path.join(langflowerDir, 'instructions.md'))
			).isFile(),
		).toBe(true);

		expect(
			(
				await fs.stat(
					path.join(
						langflowerDir,
						'skills',
						'langflower-helper',
						'SKILL.md',
					),
				)
			).isFile(),
		).toBe(true);

		expect(
			(
				await fs.stat(
					path.join(
						langflowerDir,
						'skills',
						'langflower-node-writer',
						'SKILL.md',
					),
				)
			).isFile(),
		).toBe(true);

		expect(
			(
				await fs.stat(
					path.join(
						langflowerDir,
						'skills',
						'langflower-workflow-writer',
						'SKILL.md',
					),
				)
			).isFile(),
		).toBe(true);

		const workflowsDir = path.join(langflowerDir, 'workflows');
		const files = await fs.readdir(workflowsDir);

		for (const workflowId of SKELETON_WORKFLOW_IDS) {
			expect(files).toContain(`${workflowId}.json`);
			expect(result.workflowIds).toContain(workflowId);
		}

		const starter = JSON.parse(
			await readUtf8(path.join(workflowsDir, 'starter.json')),
		) as {
			metadata: { name: string };
			$schema?: string;
			graph: {
				nodes: readonly { id: string; type: string }[];
				edges: readonly {
					fromNodeId: string;
					toNodeId: string;
					fromPort: readonly [string, number];
					toPort: readonly [string, number];
				}[];
			};
		};
		expect(starter.metadata.name).toBe('Starter');
		expect(starter.$schema).toBe('../schemas/workflow.schema.json');
		expect(
			starter.graph.nodes.some(
				(node) =>
					node.id === 'compile' &&
					node.type === 'common-langflower-tools',
			),
		).toBe(true);
		expect(
			starter.graph.edges.some(
				(edge) =>
					edge.fromNodeId === 'compile' &&
					edge.toNodeId === 'helper' &&
					edge.fromPort[0] === 'tools' &&
					edge.toPort[0] === 'tools',
			),
		).toBe(true);
		expect(
			starter.graph.edges.some(
				(edge) =>
					edge.fromNodeId === 'compile' &&
					edge.toNodeId === 'writer' &&
					edge.fromPort[0] === 'tools' &&
					edge.toPort[0] === 'tools',
			),
		).toBe(true);

		expect(
			(
				await fs.stat(
					path.join(
						langflowerDir,
						'schemas',
						'langflower-config.schema.json',
					),
				)
			).isFile(),
		).toBe(true);
		expect(
			(
				await fs.stat(
					path.join(langflowerDir, 'schemas', 'workflow.schema.json'),
				)
			).isFile(),
		).toBe(true);

		const config = JSON.parse(
			await readUtf8(path.join(langflowerDir, 'langflower.jsonc')),
		) as {
			currentWorkflowId?: string;
			$schema?: string;
			permission?: { bash?: unknown };
		};
		expect(config.currentWorkflowId).toBe('starter');
		expect(config.$schema).toBe('./schemas/langflower-config.schema.json');
		expect(config.permission?.bash).toEqual({ '*': 'allow' });
	});

	it('does not overwrite existing my-nodes, skills, or starter on create', async () => {
		await bootstrapProject(projectDir);

		const langflowerDir = path.join(projectDir, '.langflower');
		const readmePath = path.join(
			langflowerDir,
			'nodes',
			'my-nodes',
			'README.md',
		);
		const skillPath = path.join(
			langflowerDir,
			'skills',
			'langflower-helper',
			'SKILL.md',
		);
		const starterPath = path.join(
			langflowerDir,
			'workflows',
			'starter.json',
		);

		const readmeMarker = '# user-edited my-nodes readme\n';
		const skillMarker = '# user-edited skill\n';
		const starterMarker = '{"metadata":{"name":"user-starter"}}\n';

		await fs.writeFile(readmePath, readmeMarker, 'utf8');
		await fs.writeFile(skillPath, skillMarker, 'utf8');
		await fs.writeFile(starterPath, starterMarker, 'utf8');

		await bootstrapProject(projectDir, { mode: 'create' });

		expect(await readUtf8(readmePath)).toBe(readmeMarker);
		expect(await readUtf8(skillPath)).toBe(skillMarker);
		expect(await readUtf8(starterPath)).toBe(starterMarker);
	});

	it('force mode overwrites skeleton templates without touching langflower.jsonc', async () => {
		await bootstrapProject(projectDir);

		const langflowerDir = path.join(projectDir, '.langflower');
		const starterPath = path.join(
			langflowerDir,
			'workflows',
			'starter.json',
		);
		const skillPath = path.join(
			langflowerDir,
			'skills',
			'langflower-helper',
			'SKILL.md',
		);
		const readmePath = path.join(
			langflowerDir,
			'nodes',
			'my-nodes',
			'README.md',
		);
		const instructionsPath = path.join(langflowerDir, 'instructions.md');
		const configPath = path.join(langflowerDir, 'langflower.jsonc');
		const userWorkflowPath = path.join(
			langflowerDir,
			'workflows',
			'my-custom.json',
		);

		const providerMarker = {
			currentWorkflowId: 'starter',
			provider: { openai: { apiKey: 'keep-me' } },
			mcp: { servers: { local: { command: 'echo' } } },
		};

		await fs.writeFile(
			starterPath,
			'{"metadata":{"name":"stale-starter"}}\n',
			'utf8',
		);
		await fs.writeFile(skillPath, '# stale skill\n', 'utf8');
		await fs.writeFile(readmePath, '# stale readme\n', 'utf8');
		await fs.writeFile(instructionsPath, '# stale instructions\n', 'utf8');
		await fs.writeFile(
			configPath,
			`${JSON.stringify(providerMarker, null, 2)}\n`,
			'utf8',
		);
		await fs.writeFile(
			userWorkflowPath,
			'{"metadata":{"name":"Custom"}}\n',
			'utf8',
		);

		await bootstrapProject(projectDir, { mode: 'force' });

		const starter = JSON.parse(await readUtf8(starterPath)) as {
			metadata: { name: string };
		};
		expect(starter.metadata.name).toBe('Starter');

		const skill = await readUtf8(skillPath);
		expect(skill).not.toBe('# stale skill\n');
		expect(skill.length).toBeGreaterThan(20);

		const readme = await readUtf8(readmePath);
		expect(readme).not.toBe('# stale readme\n');

		const instructions = await readUtf8(instructionsPath);
		expect(instructions).not.toBe('# stale instructions\n');

		expect(JSON.parse(await readUtf8(configPath))).toEqual(providerMarker);
		expect(await readUtf8(userWorkflowPath)).toBe(
			'{"metadata":{"name":"Custom"}}\n',
		);
	});
});
