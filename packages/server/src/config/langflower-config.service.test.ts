import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LangflowerConfigService } from './langflower-config.service.js';

describe('LangflowerConfigService', () => {
	let projectDir: string;
	let isolatedGlobalPath: string;
	let service: LangflowerConfigService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-lf-config-'));
		// Do not read the developer's real OS-global langflower.jsonc.
		isolatedGlobalPath = path.join(projectDir, 'absent-global.jsonc');
		service = new LangflowerConfigService(projectDir, isolatedGlobalPath);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns empty config when langflower.jsonc is missing', async () => {
		await expect(service.read()).resolves.toEqual({});
	});

	it('parses known fields from langflower.jsonc', async () => {
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
					currentWorkflowId: 'example',
					model: 'openai/gpt-4o-mini',
					embedding: 'openai/text-embedding-3-small',
					provider: { openai: { name: 'OpenAI' } },
					permission: {
						bash: { '*': 'deny', 'npm test': 'ask' },
						read: 'allow',
					},
					harness: { denyPaths: ['.env'] },
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			currentWorkflowId: 'example',
			model: 'openai/gpt-4o-mini',
			embedding: 'openai/text-embedding-3-small',
			provider: { openai: { name: 'OpenAI' } },
			permission: {
				bash: { '*': 'deny', 'npm test': 'ask' },
				read: 'allow',
			},
			harness: { denyPaths: ['.env'] },
		});
	});

	it('preserves unknown keys on setCurrentWorkflowId', async () => {
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
					$schema: 'https://opencode.ai/config.json',
					provider: {},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await service.setCurrentWorkflowId('example');

		const raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as Record<
			string,
			unknown
		>;

		expect(raw.$schema).toBe('https://opencode.ai/config.json');
		expect(raw.currentWorkflowId).toBe('example');
		expect(raw.provider).toEqual({});
	});

	it('clears currentWorkflowId when set to undefined', async () => {
		await service.setCurrentWorkflowId('example');
		await service.setCurrentWorkflowId(undefined);

		await expect(service.read()).resolves.toEqual({});
	});

	it('ignores invalid currentWorkflowId values when reading', async () => {
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(
			configPath,
			`${JSON.stringify({ currentWorkflowId: '' })}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({});
	});

	it('parses OpenCode object models to string ids', async () => {
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
					provider: {
						openai: {
							name: 'OpenAI',
							models: {
								'gpt-4o-mini': { name: 'GPT-4o Mini' },
								'gpt-4o': { name: 'GPT-4o' },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			provider: {
				openai: {
					name: 'OpenAI',
					models: ['gpt-4o-mini', 'gpt-4o'],
				},
			},
		});
	});

	it('parses mcp.servers in MCP-node shape (no allowlist)', async () => {
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
					mcp: {
						servers: {
							echo: {
								kind: 'stdio',
								command: 'node echo.mjs',
							},
							remote: {
								kind: 'http',
								url: 'http://127.0.0.1:3100/mcp',
							},
						},
						allowlist: ['echo'],
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			mcp: {
				servers: {
					echo: {
						kind: 'stdio',
						command: 'node echo.mjs',
					},
					remote: {
						kind: 'http',
						url: 'http://127.0.0.1:3100/mcp',
					},
				},
			},
		});
	});

	it('keeps string-array models form', async () => {
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
					provider: {
						mock: {
							name: 'Mock',
							models: ['alpha', 'beta'],
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			provider: {
				mock: {
					name: 'Mock',
					models: ['alpha', 'beta'],
				},
			},
		});
	});

	it('merges project over global for overlapping providers', async () => {
		const globalPath = path.join(projectDir, 'global-langflower.jsonc');
		service = new LangflowerConfigService(projectDir, globalPath);

		await fs.mkdir(path.join(projectDir, '.langflower'), {
			recursive: true,
		});
		await fs.writeFile(
			globalPath,
			`${JSON.stringify(
				{
					model: 'global/default',
					provider: {
						shared: { name: 'Global Shared', models: ['g1'] },
						onlyGlobal: { name: 'Only Global', models: ['og'] },
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);
		await fs.writeFile(
			path.join(projectDir, '.langflower', 'langflower.jsonc'),
			`${JSON.stringify(
				{
					model: 'project/default',
					provider: {
						shared: { name: 'Project Shared', models: ['p1'] },
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			model: 'project/default',
			provider: {
				shared: { name: 'Project Shared', models: ['p1'] },
				onlyGlobal: { name: 'Only Global', models: ['og'] },
			},
		});
	});

	it('merges project embedding over global and keeps global when project omits it', async () => {
		const globalPath = path.join(projectDir, 'global-langflower.jsonc');
		service = new LangflowerConfigService(projectDir, globalPath);

		await fs.mkdir(path.join(projectDir, '.langflower'), {
			recursive: true,
		});
		await fs.writeFile(
			globalPath,
			`${JSON.stringify({ embedding: 'global/e' }, null, '\t')}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			embedding: 'global/e',
		});

		await fs.writeFile(
			path.join(projectDir, '.langflower', 'langflower.jsonc'),
			`${JSON.stringify({ embedding: 'project/e' }, null, '\t')}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			embedding: 'project/e',
		});
	});

	it('writeSettings preserves apiKey when key input is empty', async () => {
		const globalPath = path.join(projectDir, 'global-langflower.jsonc');
		service = new LangflowerConfigService(projectDir, globalPath);
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
					provider: {
						openai: {
							name: 'OpenAI',
							options: {
								baseURL: 'https://api.openai.com/v1',
								apiKey: '{env:OPENAI_API_KEY}',
							},
							models: ['gpt-4o-mini'],
						},
					},
				},
				null,
				'\t',
			)}\n`,
			'utf8',
		);

		await service.writeSettings({
			scope: 'project',
			model: 'openai/gpt-4o-mini',
			provider: {
				openai: {
					name: 'OpenAI',
					options: { baseURL: 'https://api.openai.com/v1' },
					models: ['gpt-4o-mini', 'gpt-4o'],
				},
			},
			providerApiKeys: { openai: '' },
		});

		const raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly provider: {
				readonly openai: {
					readonly options: { readonly apiKey: string };
					readonly models: readonly string[];
				};
			};
		};

		expect(raw.provider.openai.options.apiKey).toBe('{env:OPENAI_API_KEY}');
		expect(raw.provider.openai.models).toEqual(['gpt-4o-mini', 'gpt-4o']);
	});

	it('writeSettings writes {env:VAR} apiKey when provided', async () => {
		const globalPath = path.join(projectDir, 'global-langflower.jsonc');
		service = new LangflowerConfigService(projectDir, globalPath);

		await service.writeSettings({
			scope: 'project',
			provider: {
				openai: {
					name: 'OpenAI',
					models: ['gpt-4o-mini'],
				},
			},
			providerApiKeys: { openai: '{env:OPENAI_API_KEY}' },
		});

		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		const raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly provider: {
				readonly openai: {
					readonly options: { readonly apiKey: string };
				};
			};
		};

		expect(raw.provider.openai.options.apiKey).toBe('{env:OPENAI_API_KEY}');
	});

	it('writeSettings writes global scope to the global path', async () => {
		const globalPath = path.join(projectDir, 'global-langflower.jsonc');
		service = new LangflowerConfigService(projectDir, globalPath);

		await service.writeSettings({
			scope: 'global',
			model: 'lmstudio/local',
			provider: {
				lmstudio: { name: 'LM Studio', models: ['local'] },
			},
		});

		const raw = JSON.parse(await fs.readFile(globalPath, 'utf8')) as {
			readonly model: string;
			readonly provider: Record<string, unknown>;
		};

		expect(raw.model).toBe('lmstudio/local');
		expect(raw.provider.lmstudio).toMatchObject({ name: 'LM Studio' });
		expect(service.globalPath()).toBe(globalPath);
	});

	it('writeSettings sets and clears serverLogs on the active scope', async () => {
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(
			configPath,
			`${JSON.stringify({ model: 'x', serverLogs: true }, null, '\t')}\n`,
			'utf8',
		);

		await service.writeSettings({
			scope: 'project',
			serverLogs: false,
		});
		let raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly serverLogs?: boolean;
		};
		expect(raw.serverLogs).toBe(false);
		expect((await service.read()).serverLogs).toBe(false);

		await service.writeSettings({
			scope: 'project',
			serverLogs: null,
		});
		raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly serverLogs?: boolean;
		};
		expect(raw).not.toHaveProperty('serverLogs');
		expect((await service.read()).serverLogs).toBeUndefined();
	});

	it('writeSettings writes and clears embedding on the active scope', async () => {
		const configPath = path.join(
			projectDir,
			'.langflower',
			'langflower.jsonc',
		);

		await service.writeSettings({
			scope: 'project',
			embedding: 'openai/text-embedding-3-small',
		});
		let raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly embedding?: string;
		};
		expect(raw.embedding).toBe('openai/text-embedding-3-small');
		expect((await service.read()).embedding).toBe(
			'openai/text-embedding-3-small',
		);

		await service.writeSettings({
			scope: 'project',
			embedding: '',
		});
		raw = JSON.parse(await fs.readFile(configPath, 'utf8')) as {
			readonly embedding?: string;
		};
		expect(raw).not.toHaveProperty('embedding');
		expect((await service.read()).embedding).toBeUndefined();
	});
});
