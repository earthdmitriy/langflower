import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { stripCommandOutput } from './strip-command-output.ts';

const execFileAsync = promisify(execFile);

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

const TEST_TIMEOUT_MS = 180_000;

const BUILD_TIMEOUT_MS = 600_000;

const DEFAULT_TIMEOUT_MS = 120_000;

export type NpmScriptName =
	| 'build'
	| 'typecheck'
	| 'format'
	| 'format:check'
	| 'lint'
	| 'lint:fix'
	| 'test'
	| 'test:details'
	| 'test:unit'
	| 'test:integration'
	| 'verify'
	| 'verify:quick'
	| 'check:exports'
	| 'check:exports:fix'
	| 'check:dead-code'
	| 'check:dead-code:json'
	| 'clean-orphans';

export type NpmScriptTool = {
	readonly script: NpmScriptName;
	readonly toolId: string;
	readonly timeoutMs: number;
	readonly description: string;
};

export const NPM_SCRIPT_TOOLS: readonly NpmScriptTool[] = [
	{
		script: 'build',
		toolId: 'npm_build',
		timeoutMs: BUILD_TIMEOUT_MS,
		description:
			'Runs `npm run build` (full ordered package build). Does not start the dev server.',
	},
	{
		script: 'typecheck',
		toolId: 'npm_typecheck',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run typecheck` across workspaces.',
	},
	{
		script: 'format',
		toolId: 'npm_format',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description:
			'Runs `npm run format`. Rewrites files in the project with Prettier.',
	},
	{
		script: 'format:check',
		toolId: 'npm_format_check',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run format:check` (no writes).',
	},
	{
		script: 'lint',
		toolId: 'npm_lint',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run lint` (ESLint, no writes).',
	},
	{
		script: 'lint:fix',
		toolId: 'npm_lint_fix',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run lint:fix`. Rewrites files in the project.',
	},
	{
		script: 'test',
		toolId: 'npm_test',
		timeoutMs: TEST_TIMEOUT_MS,
		description:
			'Runs `npm run test` (unit and integration). Returns failed tests only.',
	},
	{
		script: 'test:details',
		toolId: 'npm_test_details',
		timeoutMs: TEST_TIMEOUT_MS,
		description:
			'Runs `npm run test:details`. Agent text is still failed tests only.',
	},
	{
		script: 'test:unit',
		toolId: 'npm_test_unit',
		timeoutMs: TEST_TIMEOUT_MS,
		description: 'Runs `npm run test:unit`.',
	},
	{
		script: 'test:integration',
		toolId: 'npm_test_integration',
		timeoutMs: TEST_TIMEOUT_MS,
		description: 'Runs `npm run test:integration`.',
	},
	{
		script: 'verify',
		toolId: 'npm_verify',
		timeoutMs: BUILD_TIMEOUT_MS,
		description:
			'Runs `npm run verify` (build + unit + integration). Slow.',
	},
	{
		script: 'verify:quick',
		toolId: 'npm_verify_quick',
		timeoutMs: BUILD_TIMEOUT_MS,
		description:
			'Runs `npm run verify:quick` (build + unit). Not a full close-out gate.',
	},
	{
		script: 'check:exports',
		toolId: 'npm_check_exports',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run check:exports` (orphan export scan).',
	},
	{
		script: 'check:exports:fix',
		toolId: 'npm_check_exports_fix',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description:
			'Runs `npm run check:exports:fix`. May rewrite export files.',
	},
	{
		script: 'check:dead-code',
		toolId: 'npm_check_dead_code',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run check:dead-code` (knip).',
	},
	{
		script: 'check:dead-code:json',
		toolId: 'npm_check_dead_code_json',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run check:dead-code:json`.',
	},
	{
		script: 'clean-orphans',
		toolId: 'npm_clean_orphans',
		timeoutMs: DEFAULT_TIMEOUT_MS,
		description: 'Runs `npm run clean-orphans` (orphan export cleanup).',
	},
];

const SCRIPT_BY_NAME: Readonly<Record<NpmScriptName, NpmScriptTool>> =
	Object.fromEntries(
		NPM_SCRIPT_TOOLS.map((tool) => [tool.script, tool]),
	) as Record<NpmScriptName, NpmScriptTool>;

export const isAllowedScript = (script: string): script is NpmScriptName =>
	Object.hasOwn(SCRIPT_BY_NAME, script);

export type TargetedSuite = 'unit' | 'integration' | 'all';

export const parseTargetedSuite = (value: unknown): TargetedSuite => {
	if (value === 'integration' || value === 'all' || value === 'unit') {
		return value;
	}

	return 'unit';
};

export const parsePathList = (value: unknown): readonly string[] => {
	if (Array.isArray(value)) {
		return value
			.filter(
				(item): item is string =>
					typeof item === 'string' && item.trim().length > 0,
			)
			.map((item) => item.trim());
	}

	if (typeof value === 'string' && value.trim().length > 0) {
		return [value.trim()];
	}

	return [];
};

export const buildTargetedTestArgv = (
	suite: TargetedSuite,
	relativePaths: readonly string[],
): readonly string[] => {
	const flags =
		suite === 'unit'
			? (['--unit'] as const)
			: suite === 'integration'
				? (['--integration'] as const)
				: ([] as const);
	return [...flags, '--', ...relativePaths];
};

const toPosix = (value: string): string => value.replaceAll('\\', '/');

/**
 * Resolve `relativeOrEmpty` under `projectDir`. Rejects escapes.
 */
export const resolveUnderProject = (
	projectDir: string,
	relativeOrEmpty: string,
): string => {
	const root = path.resolve(projectDir);
	const trimmed = relativeOrEmpty.trim();
	const resolved =
		trimmed.length === 0
			? root
			: path.isAbsolute(trimmed)
				? path.resolve(trimmed)
				: path.resolve(root, trimmed);
	const rel = path.relative(root, resolved);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error(`Path escapes projectDir: ${trimmed}`);
	}

	return resolved;
};

const toProjectRelative = (projectDir: string, resolved: string): string => {
	const rel = path.relative(path.resolve(projectDir), resolved);
	return toPosix(rel.length > 0 ? rel : '.');
};

const appendCaptured = (current: string, chunk: Buffer | string): string => {
	const next = current + String(chunk);
	if (next.length <= MAX_CAPTURE_BYTES) {
		return next;
	}

	return next.slice(-MAX_CAPTURE_BYTES);
};

type CaptureResult = {
	readonly exitCode: number | null;
	readonly timedOut: boolean;
	readonly stdout: string;
	readonly stderr: string;
};

const runNpmSpawn = (
	script: NpmScriptName,
	projectDir: string,
	timeoutMs: number,
): Promise<CaptureResult> =>
	new Promise((resolve) => {
		const signal = AbortSignal.timeout(timeoutMs);
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;
		const finish = (result: CaptureResult) => {
			if (settled) {
				return;
			}

			settled = true;
			resolve(result);
		};

		const child = spawn(`npm run ${script}`, {
			cwd: projectDir,
			shell: true,
			windowsHide: true,
			signal,
		});

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdout = appendCaptured(stdout, chunk);
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr = appendCaptured(stderr, chunk);
		});
		child.on('error', (error: Error) => {
			if (error.name === 'AbortError' || signal.aborted) {
				timedOut = true;
				return;
			}

			finish({
				exitCode: 1,
				timedOut: false,
				stdout,
				stderr:
					stderr.length > 0
						? `${stderr}\n${error.message}`
						: error.message,
			});
		});
		child.on('close', (code) => {
			finish({
				exitCode: timedOut ? null : (code ?? 1),
				timedOut,
				stdout,
				stderr,
			});
		});
	});

const requireProjectDir = (projectDir: string): string => {
	if (projectDir.length === 0) {
		throw new Error('lf-dev-tools requires ctx.projectDir.');
	}

	return projectDir;
};

export type AllowlistedNpmResult = {
	readonly ok: boolean;
	readonly text: string;
};

export const runAllowlistedNpmResult = async (
	script: NpmScriptName,
	projectDir: string,
): Promise<AllowlistedNpmResult> => {
	const root = requireProjectDir(projectDir);
	const tool = SCRIPT_BY_NAME[script];
	const captured = await runNpmSpawn(script, root, tool.timeoutMs);
	const ok = captured.exitCode === 0 && captured.timedOut === false;
	return {
		ok,
		text: stripCommandOutput({
			label: tool.toolId,
			exitCode: captured.exitCode,
			timedOut: captured.timedOut,
			stdout: captured.stdout,
			stderr: captured.stderr,
		}),
	};
};

export const runAllowlistedNpm = async (
	script: NpmScriptName,
	projectDir: string,
): Promise<string> => (await runAllowlistedNpmResult(script, projectDir)).text;

export const runTargetedTests = async (
	args: Readonly<Record<string, unknown>>,
	projectDir: string,
): Promise<string> => {
	const root = requireProjectDir(projectDir);
	const paths = parsePathList(args.paths);
	if (paths.length === 0) {
		return 'failed  run_targeted_tests  paths is required';
	}

	const relatives: string[] = [];
	for (const item of paths) {
		try {
			const resolved = resolveUnderProject(root, item);
			relatives.push(toProjectRelative(root, resolved));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			return `failed  run_targeted_tests  ${message}`;
		}
	}

	const testMjs = path.join(root, 'build', 'test.mjs');
	if (!existsSync(testMjs)) {
		return 'failed  run_targeted_tests  build/test.mjs not found';
	}

	const suite = parseTargetedSuite(args.suite);
	const argv = buildTargetedTestArgv(suite, relatives);

	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[testMjs, ...argv],
			{
				cwd: root,
				timeout: DEFAULT_TIMEOUT_MS,
				maxBuffer: MAX_CAPTURE_BYTES,
				windowsHide: true,
			},
		);
		return stripCommandOutput({
			label: 'run_targeted_tests',
			exitCode: 0,
			stdout: String(stdout),
			stderr: String(stderr),
		});
	} catch (error) {
		const err = error as {
			readonly killed?: boolean;
			readonly signal?: string | number | null;
			readonly code?: string | number;
			readonly stdout?: string;
			readonly stderr?: string;
			readonly message?: string;
		};
		const timedOut =
			err.killed === true ||
			err.signal === 'SIGTERM' ||
			err.signal === 'SIGKILL';
		const exitCode =
			typeof err.code === 'number' ? err.code : timedOut ? null : 1;
		return stripCommandOutput({
			label: 'run_targeted_tests',
			exitCode,
			timedOut,
			stdout: String(err.stdout ?? ''),
			stderr: String(err.stderr ?? err.message ?? ''),
		});
	}
};
