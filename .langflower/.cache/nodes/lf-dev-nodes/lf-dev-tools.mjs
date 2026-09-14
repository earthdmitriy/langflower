// lf-dev-tools.ts
import { defineToolRegistrations } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';

// lib/run-npm-script.ts
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

// lib/strip-command-output.ts
var STRIP_ANSI = /\x1b\[[0-9;]*m/g;
var MAX_ISSUE_LINES = 30;
var MAX_AGENT_CHARS = 8e3;
var FALLBACK_LINE_COUNT = 15;
var FILE_EXT = String.raw`\.[cm]?[jt]sx?`;
var stripAnsi = (text) => text.replace(STRIP_ANSI, '');
var combinedOutput = (input) =>
	stripAnsi(`${input.stdout}
${input.stderr}`);
var isNoiseLine = (line) => {
	const trimmed = line.trim();
	if (trimmed.length === 0) {
		return true;
	}
	if (trimmed.startsWith('> ')) {
		return true;
	}
	if (/^npm warn /i.test(trimmed)) {
		return true;
	}
	if (trimmed.includes('\u2713') || trimmed.startsWith('PASS ')) {
		return true;
	}
	if (/% (?:Stmts|Branch|Funcs|Lines)/.test(trimmed)) {
		return true;
	}
	if (/^Hint:/.test(trimmed) || /^Raw output/.test(trimmed)) {
		return true;
	}
	if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed)) {
		return true;
	}
	return false;
};
var parseBuildErrorIssues = (output) => {
	const marker = output.match(/^Issues:$/m);
	if (marker === null || marker.index === void 0) {
		return [];
	}
	const rest = output.slice(marker.index + marker[0].length);
	const end = rest.search(/\nHint:|\nRaw output/);
	const body = (end === -1 ? rest : rest.slice(0, end)).trim();
	if (body.length === 0) {
		return [];
	}
	return body
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim().length > 0 && !isNoiseLine(line));
};
var parseVitestFails = (output) => {
	const issues = [];
	const failRegex = /^ FAIL\s+(.+?)\s+>\s+(.+)$/gm;
	for (const match of output.matchAll(failRegex)) {
		const file = match[1]?.trim() ?? '';
		const testName = match[2]?.trim() ?? '';
		const blockStart = match.index ?? 0;
		const nextFail = output.indexOf('\n FAIL ', blockStart + 1);
		const blockEnd = nextFail === -1 ? output.length : nextFail;
		const block = output.slice(blockStart, blockEnd);
		const message =
			block.match(/^AssertionError:\s*(.+)$/m)?.[1]?.trim() ??
			block.match(/^Error:\s*(.+)$/m)?.[1]?.trim() ??
			block.match(/^TypeError:\s*(.+)$/m)?.[1]?.trim() ??
			'Test failed';
		issues.push(`FAIL ${file} > ${testName}`);
		issues.push(`  ${message}`);
	}
	if (issues.length === 0) {
		const summary = output.match(
			/Tests\s+(\d+)\s+failed(?:\s*\|\s*(\d+)\s+passed)?/,
		);
		if (summary) {
			issues.push(
				`Tests failed: ${summary[1]} failed, ${summary[2] ?? '0'} passed`,
			);
		}
	}
	return issues;
};
var parseTypeScriptIssues = (output) => {
	const issues = [];
	const classic = /^(.+\.tsx?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;
	for (const match of output.matchAll(classic)) {
		issues.push(
			`${match[1]}:${match[2]}:${match[3]} ${match[4]} ${match[5]?.trim() ?? ''}`,
		);
	}
	const pretty = new RegExp(
		`^(.+${FILE_EXT}):(\\d+):(\\d+):\\s+error\\s+(TS\\d+):\\s*(.+)$`,
		'gm',
	);
	for (const match of output.matchAll(pretty)) {
		issues.push(
			`${match[1]}:${match[2]}:${match[3]} ${match[4]} ${match[5]?.trim() ?? ''}`,
		);
	}
	const ngFileRegex = /^(.+\.tsx?):(\d+):(\d+):\s*$/gm;
	const ngErrorRegex = /^(?:X|✘) \[ERROR\] (TS\d+): (.+)$/gm;
	const fileMatches = [...output.matchAll(ngFileRegex)];
	const errorMatches = [...output.matchAll(ngErrorRegex)];
	for (let index = 0; index < errorMatches.length; index += 1) {
		const err = errorMatches[index];
		const file = fileMatches[index];
		if (err === void 0) {
			continue;
		}
		const path2 = file?.[1] ?? 'unknown';
		const line = file?.[2] ?? '0';
		const column = file?.[3] ?? '0';
		issues.push(
			`${path2}:${line}:${column} ${err[1]} ${err[2]?.trim() ?? ''}`,
		);
	}
	return issues;
};
var parseEslintIssues = (output) => {
	const errors = [];
	const warnings = [];
	let currentFile = '';
	const fileHeader = new RegExp(`^(\\S.+${FILE_EXT})$`);
	for (const raw of output.split(/\r?\n/)) {
		const header = raw.match(fileHeader);
		if (
			header &&
			!/^\s/.test(raw) &&
			!/\serror\s/i.test(raw) &&
			!/\swarning\s/i.test(raw)
		) {
			currentFile = header[1] ?? '';
			continue;
		}
		const stylish = raw.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+)$/);
		if (stylish && currentFile.length > 0) {
			const line = `${currentFile}:${stylish[1]}:${stylish[2]} ${stylish[3]} ${stylish[4]?.trim() ?? ''}`;
			if (stylish[3] === 'error') {
				errors.push(line);
			} else {
				warnings.push(line);
			}
			continue;
		}
		const compact = raw.match(
			new RegExp(
				`^(.+${FILE_EXT}):(\\d+):(\\d+):\\s+(error|warning)\\s+(.+)$`,
				'i',
			),
		);
		if (compact) {
			const line = `${compact[1]}:${compact[2]}:${compact[3]} ${compact[4]?.toLowerCase()} ${compact[5]?.trim() ?? ''}`;
			if ((compact[4] ?? '').toLowerCase() === 'error') {
				errors.push(line);
			} else {
				warnings.push(line);
			}
		}
	}
	return errors.length > 0 ? errors : warnings;
};
var parsePrettierIssues = (output) =>
	output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(
			(line) =>
				line.startsWith('[warn] ') &&
				!line.includes('Code style issues'),
		)
		.map((line) => line.slice('[warn] '.length).trim())
		.filter((file) => file.length > 0)
		.map((file) => `${file} format check failed`);
var parseKnipIssues = (output) => {
	const trimmed = output.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			const parsed = JSON.parse(trimmed);
			return formatKnipJson(parsed);
		} catch {}
	}
	const issues = [];
	const sections = output.matchAll(
		/^Unused (files|dependencies|devDependencies|exports|exported types) \((\d+)\)\n([\s\S]*?)(?=\nUnused |\n[A-Z]|\n*$)/gm,
	);
	for (const match of sections) {
		const count = Number(match[2]);
		if (count === 0) {
			continue;
		}
		const kind = match[1] ?? 'items';
		const body = (match[3] ?? '')
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !isNoiseLine(line));
		for (const line of body) {
			issues.push(`unused ${kind}: ${line}`);
		}
	}
	for (const line of output.split(/\r?\n/)) {
		const trimmedLine = line.trim();
		if (
			/orphan export/i.test(trimmedLine) ||
			/no (?:export )?consumer/i.test(trimmedLine)
		) {
			issues.push(trimmedLine);
		}
	}
	return issues;
};
var formatKnipJson = (value) => {
	if (typeof value !== 'object' || value === null) {
		return [];
	}
	const record = value;
	const issues = [];
	const files = record.files;
	if (Array.isArray(files)) {
		for (const file of files) {
			if (typeof file === 'string' && file.length > 0) {
				issues.push(`unused files: ${file}`);
			}
		}
	}
	const exportsList = record.exports;
	if (Array.isArray(exportsList)) {
		for (const item of exportsList) {
			if (typeof item === 'string' && item.length > 0) {
				issues.push(`unused exports: ${item}`);
			} else if (typeof item === 'object' && item !== null) {
				const row = item;
				const name = row.name;
				const file = row.file;
				if (typeof name === 'string') {
					issues.push(
						typeof file === 'string'
							? `unused exports: ${name}  ${file}`
							: `unused exports: ${name}`,
					);
				}
			}
		}
	}
	return issues;
};
var parseNpmIssues = (output) => {
	const issues = [];
	for (const line of output.split(/\r?\n/)) {
		if (
			/^npm error /i.test(line) &&
			(line.includes('code ENOENT') || line.includes('Missing script'))
		) {
			issues.push(stripAnsi(line.trim()));
		}
	}
	return issues;
};
var dedupe = (lines) => {
	const seen = /* @__PURE__ */ new Set();
	const result = [];
	for (const line of lines) {
		const key = line.trim();
		if (key.length === 0 || seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(line);
	}
	return result;
};
var fallbackLines = (output) =>
	output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !isNoiseLine(line))
		.slice(-FALLBACK_LINE_COUNT);
var collectIssues = (output) => {
	const fromPrint = parseBuildErrorIssues(output);
	const parsed = [
		...fromPrint,
		...parseVitestFails(output),
		...parseTypeScriptIssues(output),
		...parseEslintIssues(output),
		...parsePrettierIssues(output),
		...parseKnipIssues(output),
		...parseNpmIssues(output),
	];
	const unique = dedupe(parsed);
	if (unique.length > 0) {
		return unique;
	}
	return fallbackLines(output);
};
var capIssues = (lines) => {
	const omitted = Math.max(0, lines.length - MAX_ISSUE_LINES);
	const kept = omitted > 0 ? lines.slice(0, MAX_ISSUE_LINES) : lines;
	const withNote =
		omitted > 0
			? [...kept, `\u2026 ${String(omitted)} more issues omitted`]
			: kept;
	return { text: withNote.join('\n'), omitted };
};
var capChars = (text) => {
	if (text.length <= MAX_AGENT_CHARS) {
		return text;
	}
	return `${text.slice(0, MAX_AGENT_CHARS - 24)}
\u2026 truncated`;
};
var stripCommandOutput = (input) => {
	if (input.timedOut === true) {
		const body2 = capIssues(collectIssues(combinedOutput(input))).text;
		const header2 = `failed  ${input.label}  (timeout)`;
		return capChars(
			body2.length > 0
				? `${header2}
${body2}`
				: header2,
		);
	}
	if (input.exitCode === 0) {
		return `ok  ${input.label}`;
	}
	const header = `failed  ${input.label}  (exit ${String(input.exitCode ?? 1)})`;
	const body = capIssues(collectIssues(combinedOutput(input))).text;
	return capChars(
		body.length > 0
			? `${header}
${body}`
			: header,
	);
};

// lib/run-npm-script.ts
var execFileAsync = promisify(execFile);
var MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
var TEST_TIMEOUT_MS = 18e4;
var BUILD_TIMEOUT_MS = 6e5;
var DEFAULT_TIMEOUT_MS = 12e4;
var NPM_SCRIPT_TOOLS = [
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
var SCRIPT_BY_NAME = Object.fromEntries(
	NPM_SCRIPT_TOOLS.map((tool) => [tool.script, tool]),
);
var parseTargetedSuite = (value) => {
	if (value === 'integration' || value === 'all' || value === 'unit') {
		return value;
	}
	return 'unit';
};
var parsePathList = (value) => {
	if (Array.isArray(value)) {
		return value
			.filter(
				(item) => typeof item === 'string' && item.trim().length > 0,
			)
			.map((item) => item.trim());
	}
	if (typeof value === 'string' && value.trim().length > 0) {
		return [value.trim()];
	}
	return [];
};
var buildTargetedTestArgv = (suite, relativePaths) => {
	const flags =
		suite === 'unit'
			? ['--unit']
			: suite === 'integration'
				? ['--integration']
				: [];
	return [...flags, '--', ...relativePaths];
};
var toPosix = (value) => value.replaceAll('\\', '/');
var resolveUnderProject = (projectDir, relativeOrEmpty) => {
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
var toProjectRelative = (projectDir, resolved) => {
	const rel = path.relative(path.resolve(projectDir), resolved);
	return toPosix(rel.length > 0 ? rel : '.');
};
var appendCaptured = (current, chunk) => {
	const next = current + String(chunk);
	if (next.length <= MAX_CAPTURE_BYTES) {
		return next;
	}
	return next.slice(-MAX_CAPTURE_BYTES);
};
var runNpmSpawn = (script, projectDir, timeoutMs) =>
	new Promise((resolve) => {
		const signal = AbortSignal.timeout(timeoutMs);
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;
		const finish = (result) => {
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
		child.stdout?.on('data', (chunk) => {
			stdout = appendCaptured(stdout, chunk);
		});
		child.stderr?.on('data', (chunk) => {
			stderr = appendCaptured(stderr, chunk);
		});
		child.on('error', (error) => {
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
						? `${stderr}
${error.message}`
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
var requireProjectDir = (projectDir) => {
	if (projectDir.length === 0) {
		throw new Error('lf-dev-tools requires ctx.projectDir.');
	}
	return projectDir;
};
var runAllowlistedNpmResult = async (script, projectDir) => {
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
var runAllowlistedNpm = async (script, projectDir) =>
	(await runAllowlistedNpmResult(script, projectDir)).text;
var runTargetedTests = async (args, projectDir) => {
	const root = requireProjectDir(projectDir);
	const paths = parsePathList(args.paths);
	if (paths.length === 0) {
		return 'failed  run_targeted_tests  paths is required';
	}
	const relatives = [];
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
		const err = error;
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

// lf-dev-tools.ts
var EMPTY_ARGS_SCHEMA = {
	type: 'object',
	properties: {},
	additionalProperties: false,
};
var lf_dev_tools_default = defineToolRegistrations({
	type: 'lf-dev-tools',
	displayName: 'LF Dev Tools',
	category: 'Tools',
	description:
		'Emits npm script ToolHandles and `run_targeted_tests` for agent inventory. Results are stripped to pass/fail plus errors.',
	tools: [
		...NPM_SCRIPT_TOOLS.map((tool) => ({
			toolId: tool.toolId,
			name: tool.toolId,
			description: tool.description,
			inputSchema: EMPTY_ARGS_SCHEMA,
			handler: async (_args, ctx) =>
				runAllowlistedNpm(tool.script, String(ctx.projectDir ?? '')),
		})),
		{
			toolId: 'run_targeted_tests',
			name: 'run_targeted_tests',
			description:
				'Runs `node build/test.mjs` on given project-relative paths. Optional `suite`: unit (default), integration, or all. Returns failed tests only. Do not overlap with a full `npm_test` in the same project.',
			inputSchema: {
				type: 'object',
				properties: {
					paths: {
						type: 'array',
						items: { type: 'string' },
						minItems: 1,
						description:
							'Test files or directories relative to the project root.',
					},
					suite: {
						type: 'string',
						enum: ['unit', 'integration', 'all'],
						description:
							'Vitest project. Default unit. Use integration for tests/integration/**.',
					},
				},
				required: ['paths'],
				additionalProperties: false,
			},
			handler: async (args, ctx) =>
				runTargetedTests(args, String(ctx.projectDir ?? '')),
		},
	],
});
export { lf_dev_tools_default as default };
