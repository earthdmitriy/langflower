import { getRunHostServices } from '@langflower/common-nodes/ai/run-host-services';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerConfigService } from '../config/langflower-config.service.js';
import { buildExecutionContext } from './build-execution-context.js';

describe('buildExecutionContext', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-exec-ctx-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('loads skillMarkdown from params.skillId at seed time', async () => {
		const skillDir = path.join(
			projectDir,
			'.langflower',
			'skills',
			'coder',
		);
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			path.join(skillDir, 'SKILL.md'),
			'fresh-skill-body',
			'utf8',
		);

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: { skillId: 'coder' },
			},
		);

		expect(getRunHostServices(ctx)?.skillMarkdown).toBe('fresh-skill-body');
		expect(ctx).not.toHaveProperty('readSkillMarkdown');
		expect(ctx).not.toHaveProperty('skillMarkdown');
	});

	it('loads skillMarkdown from rolePreset default when skillId empty', async () => {
		const skillDir = path.join(projectDir, '.langflower', 'skills', 'plan');
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			path.join(skillDir, 'SKILL.md'),
			'plan-skill-body',
			'utf8',
		);

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-fake-llm',
				params: { rolePreset: 'plan' },
			},
		);

		expect(getRunHostServices(ctx)?.skillMarkdown).toBe('plan-skill-body');
	});

	it('loads agentsMarkdown when includeAgentsMd is true', async () => {
		await fs.writeFile(
			path.join(projectDir, 'AGENTS.md'),
			'# Root agents\nBe careful.',
			'utf8',
		);

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: { includeAgentsMd: true },
			},
		);

		expect(getRunHostServices(ctx)?.agentsMarkdown).toBe(
			'# Root agents\nBe careful.',
		);
		expect(ctx).not.toHaveProperty('agentsMarkdown');
	});

	it('omits agentsMarkdown when includeAgentsMd is false or unset', async () => {
		await fs.writeFile(
			path.join(projectDir, 'AGENTS.md'),
			'# Should not load',
			'utf8',
		);

		const off = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: { includeAgentsMd: false },
			},
		);
		const unset = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-2',
			{
				id: 'node-2',
				type: 'common-openai-llm',
				params: {},
			},
		);

		expect(getRunHostServices(off)?.agentsMarkdown).toBeUndefined();
		expect(getRunHostServices(unset)?.agentsMarkdown).toBeUndefined();
	});

	it('attaches empty agentsMarkdown omission when file missing and toggle on', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-fake-llm',
				params: { includeAgentsMd: true },
			},
		);

		expect(getRunHostServices(ctx)?.agentsMarkdown).toBeUndefined();
	});

	it('injects createChatCompletionStream bound to server config', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: {},
			},
		);

		expect(typeof getRunHostServices(ctx)?.createChatCompletionStream).toBe(
			'function',
		);
		expect(JSON.stringify(ctx)).not.toMatch(/apiKey|sk-/);
		expect(ctx).not.toHaveProperty('createChatCompletionStream');
	});

	it('injects defaultChat from effective LangflowerConfig.model', async () => {
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(
			configPath,
			`${JSON.stringify({ model: 'lmstudio/local-model' })}\n`,
			'utf8',
		);
		const isolatedGlobal = path.join(projectDir, 'absent-global.jsonc');

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
					isolatedGlobal,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: {},
			},
		);

		expect(getRunHostServices(ctx)?.defaultChat).toEqual({
			providerId: 'lmstudio',
			model: 'local-model',
		});
	});

	it('omits createChatCompletionStream for Fake LLM (imitate path)', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-fake-llm',
				params: {},
			},
		);

		expect(
			getRunHostServices(ctx)?.createChatCompletionStream,
		).toBeUndefined();
	});

	it('injects toolHandles from @langflower/tools', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: {},
			},
		);

		expect(ctx).not.toHaveProperty('harness');
		expect(ctx).not.toHaveProperty('files');
		expect(ctx).not.toHaveProperty('crawl');
		expect(ctx.toolHandles?.map((handle) => handle.toolId)).toContain(
			'read',
		);

		await fs.writeFile(path.join(projectDir, 'hello.txt'), 'hi', 'utf8');
		const readHandle = ctx.toolHandles?.find(
			(handle) => handle.toolId === 'read',
		);
		expect(readHandle).toBeDefined();
		const text = await readHandle!.invoke({ path: 'hello.txt' });
		expect(text).toContain('hi');
	});

	it('applies Plan role toolPermissions on toolHandles', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: { rolePreset: 'plan' },
			},
		);

		expect(ctx.toolHandles?.map((handle) => handle.toolId)).not.toContain(
			'bash',
		);

		const writeHandle = ctx.toolHandles?.find(
			(handle) => handle.toolId === 'write',
		);
		expect(writeHandle).toBeDefined();
		await expect(
			writeHandle!.invoke({ path: 'src/foo.ts', content: 'x' }),
		).rejects.toThrow(/Permission denied/);
	});

	it('applies Coder toolPermissions (bash ask) without role overlay', async () => {
		const asks: string[] = [];
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: () => undefined,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-openai-llm',
				params: { rolePreset: 'coder' },
			},
			{
				runId: 'run-1',
				nodeId: 'node-1',
				requestPermission: async (_runId, _nodeId, request) => {
					asks.push(request.toolId);
					return 'deny';
				},
				emitPermissionAsk: () => undefined,
			},
		);

		const bashHandle = ctx.toolHandles?.find(
			(handle) => handle.toolId === 'bash',
		);
		expect(bashHandle).toBeDefined();
		await expect(
			bashHandle!.invoke({ command: 'echo hi' }),
		).rejects.toThrow();
		expect(asks).toEqual(['bash']);
	});
});
