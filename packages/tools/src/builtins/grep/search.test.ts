import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	MAX_GREP_MATCHES,
	runGrepCascade,
	searchWithNodeWalk,
	type GrepSearchDeps,
	type GrepSearchInput,
} from './search.js';

describe('grep cascade', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-grep-'));
		await fs.mkdir(path.join(projectRoot, 'src'));
		await fs.writeFile(
			path.join(projectRoot, 'src', 'a.ts'),
			'const hello = 1;\nconst target = 2;\n',
			'utf8',
		);
		await fs.writeFile(
			path.join(projectRoot, 'src', 'b.ts'),
			'export const target = 3;\n',
			'utf8',
		);
		await fs.mkdir(path.join(projectRoot, 'node_modules', 'pkg'), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(projectRoot, 'node_modules', 'pkg', 'x.ts'),
			'const target = "ignored";\n',
			'utf8',
		);
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
	});

	const baseInput = (): GrepSearchInput => ({
		pattern: 'target',
		caseInsensitive: false,
		respectGitignore: false,
		searchAbsolute: projectRoot,
		fenceRoot: projectRoot,
		displayPath: (absolute) =>
			path.relative(projectRoot, absolute).split(path.sep).join('/'),
	});

	it('uses rg when available and does not fall through', async () => {
		const spawnCapture = vi.fn(async () => ({
			stdout: `${path.join(projectRoot, 'src', 'a.ts')}:2:const target = 2;\n`,
			stderr: '',
			code: 0,
		}));
		const deps: GrepSearchDeps = {
			commandExists: async (cmd) => cmd === 'rg',
			spawnCapture,
		};

		const result = await runGrepCascade(baseInput(), deps);

		expect(result.backend).toBe('rg');
		expect(result.body).toContain('src/a.ts:2:');
		expect(spawnCapture).toHaveBeenCalledTimes(1);
		expect(spawnCapture.mock.calls[0]?.[0]).toBe('rg');
	});

	it('falls through rg → grep → node', async () => {
		const spawnCapture = vi.fn(async (command: string) => {
			if (command === 'grep') {
				return {
					stdout: `${path.join(projectRoot, 'src', 'b.ts')}:1:export const target = 3;\n`,
					stderr: '',
					code: 0,
				};
			}

			throw new Error('should not spawn rg');
		});
		const deps: GrepSearchDeps = {
			commandExists: async (cmd) => cmd === 'grep',
			spawnCapture,
		};

		const result = await runGrepCascade(baseInput(), deps);

		expect(result.backend).toBe('grep');
		expect(result.body).toContain('src/b.ts:1:');
	});

	it('uses bounded Node walk when CLIs are missing', async () => {
		const deps: GrepSearchDeps = {
			commandExists: async () => false,
			spawnCapture: async () => {
				throw new Error('spawn should not run');
			},
		};

		const result = await runGrepCascade(baseInput(), deps);

		expect(result.backend).toBe('node');
		expect(result.body).toContain('src/a.ts:');
		expect(result.body).toContain('src/b.ts:');
		expect(result.body).not.toContain('node_modules');
	});

	it('Node walk skips node_modules and honors abort', async () => {
		const controller = new AbortController();
		controller.abort();

		await expect(
			searchWithNodeWalk({
				...baseInput(),
				signal: controller.signal,
			}),
		).rejects.toThrow('aborted');
	});

	it('kills in-flight spawn when AbortSignal fires', async () => {
		const controller = new AbortController();
		let sawSignal: AbortSignal | undefined;

		const spawnCapture = vi.fn(
			async (
				_command: string,
				_args: readonly string[],
				options?: { readonly signal?: AbortSignal },
			) => {
				sawSignal = options?.signal;
				await new Promise<void>((_resolve, reject) => {
					options?.signal?.addEventListener('abort', () => {
						reject(new Error('aborted'));
					});
				});
				return { stdout: '', stderr: '', code: 0 };
			},
		);

		const pending = runGrepCascade(
			{ ...baseInput(), signal: controller.signal },
			{
				commandExists: async (cmd) => cmd === 'rg',
				spawnCapture,
			},
		);

		await Promise.resolve();
		expect(sawSignal).toBe(controller.signal);
		controller.abort();

		await expect(pending).rejects.toThrow('aborted');
	});

	it('Node walk caps matches', async () => {
		const lines = Array.from(
			{ length: MAX_GREP_MATCHES + 20 },
			(_, i) => `target line ${i}`,
		).join('\n');
		await fs.writeFile(
			path.join(projectRoot, 'src', 'many.ts'),
			`${lines}\n`,
			'utf8',
		);

		const result = await runGrepCascade(baseInput(), {
			commandExists: async () => false,
		});

		expect(result.backend).toBe('node');
		expect(result.body).toContain(`truncated at ${MAX_GREP_MATCHES}`);
		const hitLines = result.body
			.split('\n')
			.filter((line) => /^[^:]+:\d+:/.test(line));
		expect(hitLines.length).toBe(MAX_GREP_MATCHES);
	});
});
