import { getCommonReactiveNode } from '@langflower/common-nodes';
import { getRunHostServices } from '@langflower/common-nodes/run-host-services';
import {
	contextSymbol,
	type NodeCapabilityId,
	type ReactiveNodeDefinition,
} from '@langflower/node-sdk';
import * as projectHarness from '@langflower/tools/create-project-harness';
import * as systemMcp from '@langflower/tools/create-system-mcp-handles';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangflowerConfigService } from '../config/langflower-config.service.js';
import * as providerCredentials from '../config/resolve-provider-credentials.js';
import {
	buildContextSeeds,
	buildExecutionContext,
} from './build-execution-context.js';

const ctxChat = (
	ctx: object,
):
	| ((request: {
			readonly providerId: string;
			readonly model: string;
			readonly messages: readonly {
				readonly role: string;
				readonly content: string;
			}[];
	  }) => Promise<unknown>)
	| undefined => {
	const chat = (ctx as { readonly chat?: unknown }).chat;
	return typeof chat === 'function'
		? (chat as (request: {
				readonly providerId: string;
				readonly model: string;
				readonly messages: readonly {
					readonly role: string;
					readonly content: string;
				}[];
			}) => Promise<unknown>)
		: undefined;
};

const definitionWithRequires = (
	requires: readonly NodeCapabilityId[],
): ReactiveNodeDefinition =>
	({
		type: 'test-caps',
		displayName: 'test-caps',
		requires,
		uiSchema: [],
		inputsConfigs: [],
		outputsConfigs: [],
		bypassPorts: {},
		emitOncePerActivation: false,
		stopsRun: false,
		chatEntry: false,
		getInstance: () => {
			throw new Error('unused');
		},
	}) as ReactiveNodeDefinition;

const resolveRequires = (requires: readonly NodeCapabilityId[]) => () =>
	definitionWithRequires(requires);

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
				resolveDefinition: resolveRequires(['promptContext']),
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
		expect((ctx as { readonly skillMarkdown?: string }).skillMarkdown).toBe(
			'fresh-skill-body',
		);
		expect(ctx).not.toHaveProperty('readSkillMarkdown');
	});

	it('loads skillMarkdown from rolePreset default when skillId empty', async () => {
		const skillDir = path.join(
			projectDir,
			'.langflower',
			'skills',
			'spec-architect',
		);
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			path.join(skillDir, 'SKILL.md'),
			'plan-skill-body',
			'utf8',
		);

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['promptContext']),
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
				resolveDefinition: resolveRequires(['promptContext']),
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
		expect(
			(ctx as { readonly agentsMarkdown?: string }).agentsMarkdown,
		).toBe('# Root agents\nBe careful.');
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
				resolveDefinition: resolveRequires(['promptContext']),
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
				resolveDefinition: resolveRequires(['promptContext']),
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
				resolveDefinition: resolveRequires(['promptContext']),
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
				resolveDefinition: resolveRequires(['chat']),
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

		expect(typeof ctxChat(ctx)).toBe('function');
		expect(JSON.stringify(ctx)).not.toMatch(/apiKey|sk-/);
		expect(ctx).not.toHaveProperty('createChatCompletionStream');
	});

	it('attaches secrets on host services without putting them on ctx JSON', async () => {
		const isolatedGlobal = path.join(projectDir, 'isolated-global.jsonc');
		const secretsPath = path.join(projectDir, 'langflower.secrets.json');
		await fs.writeFile(
			secretsPath,
			`${JSON.stringify({ API_TOKEN: 'sk-secret-value' })}\n`,
			'utf8',
		);

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['secrets']),
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
					isolatedGlobal,
				),
			},
			'run-1',
			{
				id: 'node-1',
				type: 'common-mcp-http',
				params: {},
			},
		);

		expect(getRunHostServices(ctx)?.secrets).toEqual({
			API_TOKEN: 'sk-secret-value',
		});
		expect(JSON.stringify(ctx)).not.toMatch(/sk-secret-value|API_TOKEN/);
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
				resolveDefinition: resolveRequires(['promptContext']),
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

	it('injects createEmbedding and defaultEmbedding from config.embedding', async () => {
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(
			configPath,
			`${JSON.stringify(
				{
					embedding: 'openai/text-embedding-3-small',
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);
		const isolatedGlobal = path.join(projectDir, 'absent-global.jsonc');

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['embed']),
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

		expect(typeof getRunHostServices(ctx)?.createEmbedding).toBe(
			'function',
		);
		expect(getRunHostServices(ctx)?.defaultEmbedding).toEqual({
			providerId: 'openai',
			model: 'text-embedding-3-small',
		});
		expect(JSON.stringify(ctx)).not.toMatch(/apiKey|sk-/);
		expect(ctx).not.toHaveProperty('createEmbedding');
	});

	it('injects chat for an LLM node that declares no extra requires', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: (node) =>
					getCommonReactiveNode(node.type) ??
					definitionWithRequires([
						'chat',
						'tools',
						'promptContext',
						'permissionAsk',
						'liveTools',
						'paths',
						'hosts',
						'authorize',
					]),
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
			{
				runId: 'run-1',
				nodeId: 'node-1',
				requestPermission: async () => 'allow' as const,
				emitPermissionAsk: () => undefined,
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
				getLiveWiredTools: () => [],
			},
		);

		expect(typeof ctxChat(ctx)).toBe('function');
		expect(ctx.toolHandles?.length).toBeGreaterThan(0);
	});

	it('injects toolHandles from @langflower/tools', async () => {
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['tools']),
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
		expect(ctx.toolHandles?.map((handle) => handle.toolId)).toContain(
			'ask_user',
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
				resolveDefinition: resolveRequires(['tools']),
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
		expect(ctx.toolHandles?.map((handle) => handle.toolId)).toContain(
			'ask_user',
		);
		expect(ctx.toolHandles?.map((handle) => handle.toolId)).toContain(
			'sleep',
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
				resolveDefinition: resolveRequires(['tools']),
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
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
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

	it('attaches requestLangflowerBus from harness hooks onto RunHostServices', async () => {
		const requestLangflowerBus = async () => ({
			status: 'ok',
		});

		const llmCtx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires([]),
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
			{
				runId: 'run-1',
				nodeId: 'node-1',
				requestPermission: async () => 'allow' as const,
				emitPermissionAsk: () => undefined,
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
				requestLangflowerBus,
			},
		);
		const toolsCtx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['editorBus']),
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'lf-tools-1',
				type: 'common-langflower-tools',
				params: {},
			},
			{
				runId: 'run-1',
				nodeId: 'lf-tools-1',
				requestPermission: async () => 'allow' as const,
				emitPermissionAsk: () => undefined,
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
				requestLangflowerBus,
			},
		);

		expect(
			getRunHostServices(llmCtx)?.requestLangflowerBus,
		).toBeUndefined();
		expect(getRunHostServices(toolsCtx)?.requestLangflowerBus).toBe(
			requestLangflowerBus,
		);
	});

	it('attaches getLiveWiredTools from harness hooks onto RunHostServices', async () => {
		const getLiveWiredTools = () => [];

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['liveTools']),
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
			{
				runId: 'run-1',
				nodeId: 'node-1',
				requestPermission: async () => 'allow' as const,
				emitPermissionAsk: () => undefined,
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
				getLiveWiredTools,
			},
		);

		expect(getRunHostServices(ctx)?.getLiveWiredTools).toBe(
			getLiveWiredTools,
		);
	});

	it('does not attach liveTools on nodes that do not declare it', async () => {
		const getLiveWiredTools = () => [];

		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires([]),
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			{
				id: 'text-1',
				type: 'common-string',
				params: {},
			},
			{
				runId: 'run-1',
				nodeId: 'text-1',
				requestPermission: async () => 'allow' as const,
				emitPermissionAsk: () => undefined,
				emitPermissionAccepted: () => undefined,
				requestAskUser: async () => '',
				emitAskUserAsk: () => undefined,
				getLiveWiredTools,
			},
		);

		expect(getRunHostServices(ctx)?.getLiveWiredTools).toBeUndefined();
	});

	it('builds zero tool harnesses and no secrets map for pure nodes', async () => {
		const harnessSpy = vi.spyOn(projectHarness, 'createProjectHarness');
		const wrapSpy = vi.spyOn(projectHarness, 'wrapBuiltinToolHandles');
		const mcpSpy = vi.spyOn(systemMcp, 'createSystemMcpHandles');

		const resolveDefinition = (node: { readonly type: string }) =>
			getCommonReactiveNode(node.type) ?? definitionWithRequires([]);

		for (const type of [
			'common-string',
			'common-delay',
			'common-preview',
		] as const) {
			const ctx = await buildExecutionContext(
				{
					projectDir,
					resolveDefinition,
					langflowerConfigService: new LangflowerConfigService(
						projectDir,
					),
				},
				'run-1',
				{ id: type, type, params: {} },
			);
			expect(getRunHostServices(ctx)?.secrets).toBeUndefined();
			expect(ctx).not.toHaveProperty('secrets');
			expect(ctx.toolHandles).toBeUndefined();
		}

		expect(harnessSpy).not.toHaveBeenCalled();
		expect(wrapSpy).not.toHaveBeenCalled();
		expect(mcpSpy).not.toHaveBeenCalled();
		harnessSpy.mockRestore();
		wrapSpy.mockRestore();
		mcpSpy.mockRestore();
	});

	it('gives secrets to mcp-http and not to read-file', async () => {
		const isolatedGlobal = path.join(projectDir, 'isolated-global.jsonc');
		const secretsPath = path.join(projectDir, 'langflower.secrets.json');
		await fs.writeFile(
			secretsPath,
			`${JSON.stringify({ API_TOKEN: 'sk-secret-value' })}\n`,
			'utf8',
		);
		const resolveDefinition = (node: { readonly type: string }) =>
			getCommonReactiveNode(node.type) ?? definitionWithRequires([]);

		const mcp = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
					isolatedGlobal,
				),
			},
			'run-1',
			{ id: 'mcp-1', type: 'common-mcp-http', params: {} },
		);
		const read = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition,
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
					isolatedGlobal,
				),
			},
			'run-1',
			{ id: 'read-1', type: 'common-read-file', params: {} },
		);

		expect(getRunHostServices(mcp)?.secrets).toEqual({
			API_TOKEN: 'sk-secret-value',
		});
		expect(getRunHostServices(read)?.secrets).toBeUndefined();
	});

	it('resolves missing provider credentials at call time, not seed', async () => {
		const resolveSpy = vi.spyOn(
			providerCredentials,
			'resolveProviderCredentials',
		);
		const ctx = await buildExecutionContext(
			{
				projectDir,
				resolveDefinition: resolveRequires(['chat']),
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

		expect(resolveSpy).not.toHaveBeenCalled();
		const chat = ctxChat(ctx);
		expect(typeof chat).toBe('function');
		await expect(
			chat!({
				providerId: 'openai',
				model: 'gpt-4o',
				messages: [{ role: 'user', content: 'hi' }],
			}),
		).rejects.toThrow(/Provider "openai" is not configured/);
		expect(resolveSpy).toHaveBeenCalledTimes(1);
		resolveSpy.mockRestore();
	});

	it('seeds one ctx error for an unbound required capability', async () => {
		const seeds = await buildContextSeeds(
			{
				activeWorkflow: {
					graph: {
						nodes: [
							{
								id: 'bus-1',
								type: 'common-langflower-tools',
								params: {},
							},
						],
					},
				},
				setMcpDispose: () => undefined,
				permissionAsks: {
					requestPermission: async () => 'allow' as const,
				},
				askUserAsks: { requestAskUser: async () => '' },
			} as never,
			{
				projectDir,
				resolveDefinition: resolveRequires(['editorBus']),
				langflowerConfigService: new LangflowerConfigService(
					projectDir,
				),
			},
			'run-1',
			() => undefined,
			() => undefined,
			() => undefined,
		);

		expect(Object.keys(seeds)).toEqual(['bus-1']);
		const seed = seeds['bus-1']?.[0];
		expect(seed?.portId).toBe(contextSymbol);
		await expect(
			firstValueFrom(seed!.value as never),
		).rejects.toMatchObject({
			message: expect.stringMatching(
				/Node "bus-1" requires capability "editorBus".*server session/,
			),
		});
	});
});
