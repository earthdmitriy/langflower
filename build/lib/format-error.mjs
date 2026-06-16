import { log } from './logger.mjs';

// Strip terminal color codes from captured output before parsing.
// eslint-disable-next-line no-control-regex -- ANSI escape sequences
const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

/**
 * Structured build failure with human-readable print() output.
 */
export class BuildError extends Error {
	constructor(stepName, summary, details, exitCode = 1) {
		super(summary);
		this.name = 'BuildError';
		this.stepName = stepName;
		this.summary = summary;
		this.details = details;
		this.exitCode = exitCode;
	}

	print() {
		log.blank();
		log.error(`Failed: ${this.stepName}`);
		log.error(this.summary);

		if (this.details?.issues?.length > 0) {
			log.blank();
			log.info('Issues:');
			for (const issue of this.details.issues) {
				process.stderr.write(formatIssue(issue));
			}
		}

		if (this.details?.hint) {
			log.blank();
			log.warn(`Hint: ${this.details.hint}`);
		}

		if (this.details?.rawTail) {
			log.blank();
			log.info('Raw output (last lines):');
			process.stderr.write(`${cDim(this.details.rawTail)}\n`);
		}
	}
}

function cDim(text) {
	return `\x1b[2m${text}\x1b[0m`;
}

function stripAnsi(text) {
	return text.replace(STRIP_ANSI, '');
}

function tailLines(text, count = 12) {
	const lines = stripAnsi(text).split(/\r?\n/).filter(Boolean);
	return lines.slice(-count).join('\n');
}

function formatIssue(issue) {
	if (issue.kind === 'typescript') {
		return [
			`  ${issue.file}:${issue.line}:${issue.column}`,
			`    ${issue.code}: ${issue.message}`,
			'',
		].join('\n');
	}

	if (issue.kind === 'angular') {
		return [
			`  ${issue.message}`,
			issue.context ? `    ${issue.context}` : '',
			'',
		]
			.filter(Boolean)
			.join('\n');
	}

	if (issue.kind === 'vitest') {
		const lines = [
			issue.testName ? `  ${issue.testName}` : '',
			issue.file ? `    ${issue.file}:${issue.line}:${issue.column}` : '',
			`    ${issue.message}`,
		].filter(Boolean);

		return `${lines.join('\n')}\n\n`;
	}

	return `  ${issue.message}\n`;
}

function parseTypeScriptIssues(output) {
	const issues = [];
	const regex = /^(.+\.tsx?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;

	for (const match of output.matchAll(regex)) {
		issues.push({
			kind: 'typescript',
			file: match[1],
			line: Number(match[2]),
			column: Number(match[3]),
			code: match[4],
			message: match[5].trim(),
		});
	}

	const ngFileRegex = /^(.+\.tsx?):(\d+):(\d+):\s*$/gm;
	const ngErrorRegex = /^(?:X|✘) \[ERROR\] (TS\d+): (.+)$/gm;

	const fileMatches = [...output.matchAll(ngFileRegex)];
	const errorMatches = [...output.matchAll(ngErrorRegex)];

	for (let i = 0; i < errorMatches.length; i += 1) {
		const err = errorMatches[i];
		const file = fileMatches[i];

		issues.push({
			kind: 'typescript',
			file: file?.[1] ?? 'unknown',
			line: Number(file?.[2] ?? 0),
			column: Number(file?.[3] ?? 0),
			code: err[1],
			message: err[2].trim(),
		});
	}

	return issues;
}

function parseAngularIssues(output) {
	const issues = [];
	const errorBlocks = output.match(
		/(?:✘|X) \[ERROR\][\s\S]*?(?=\n(?:✘|X) \[ERROR\]|\nApplication bundle|$)/g,
	);

	if (errorBlocks) {
		for (const block of errorBlocks) {
			const tsLine = block.match(/(?:✘|X) \[ERROR\] (TS\d+): (.+)/);
			const fileLine = block.match(/^(.+\.tsx?):(\d+):(\d+):/m);

			if (tsLine) {
				issues.push({
					kind: 'angular',
					message: `${tsLine[1]}: ${tsLine[2].trim()}`,
					context: fileLine
						? `${fileLine[1]}:${fileLine[2]}:${fileLine[3]}`
						: undefined,
				});
				continue;
			}

			const firstLine = block
				.split('\n')
				.map((line) => line.trim())
				.find((line) => line.length > 0);

			if (firstLine) {
				issues.push({
					kind: 'angular',
					message: stripAnsi(firstLine),
					context: stripAnsi(
						block.split('\n').slice(1, 4).join(' ').trim(),
					),
				});
			}
		}
	}

	const classic = output.match(/^Error: .+$/gm);
	if (classic) {
		for (const line of classic) {
			issues.push({
				kind: 'angular',
				message: stripAnsi(line),
			});
		}
	}

	return issues;
}

function parseVitestIssues(output) {
	const issues = [];
	const failRegex = /^ FAIL\s+(.+?)\s+>\s+(.+)$/gm;

	for (const match of output.matchAll(failRegex)) {
		const file = match[1].trim();
		const testName = match[2].trim();
		const blockStart = match.index ?? 0;
		const nextFail = output.indexOf('\n FAIL ', blockStart + 1);
		const blockEnd = nextFail === -1 ? output.length : nextFail;
		const block = output.slice(blockStart, blockEnd);

		const message =
			block.match(/^AssertionError:\s*(.+)$/m)?.[1]?.trim() ??
			block.match(/^Error:\s*(.+)$/m)?.[1]?.trim() ??
			block.match(/^TypeError:\s*(.+)$/m)?.[1]?.trim() ??
			'Test failed';

		const loc = block.match(/^[ \t]*❯\s+(.+):(\d+):(\d+)/m);

		issues.push({
			kind: 'vitest',
			file: loc?.[1] ?? file,
			line: Number(loc?.[2] ?? 0),
			column: Number(loc?.[3] ?? 0),
			testName: `${file} > ${testName}`,
			message,
		});
	}

	const summaryFail = output.match(
		/Tests\s+(\d+)\s+failed(?:\s*\|\s*(\d+)\s+passed)?/,
	);

	if (issues.length === 0 && summaryFail) {
		issues.push({
			kind: 'vitest',
			message: `Tests failed: ${summaryFail[1]} failed, ${summaryFail[2] ?? '0'} passed`,
		});
	}

	return issues;
}

function parseNpmIssues(output) {
	const issues = [];
	const npmErr = output.match(/^npm error .+$/gm);

	if (npmErr) {
		for (const line of npmErr) {
			if (
				line.includes('code ENOENT') ||
				line.includes('Missing script')
			) {
				issues.push({ kind: 'npm', message: stripAnsi(line) });
			}
		}
	}

	return issues;
}

function dedupeIssues(issues) {
	const seen = new Set();

	return issues.filter((issue) => {
		const key =
			issue.kind === 'typescript'
				? `${issue.code}:${issue.file}:${issue.line}:${issue.message}`
				: issue.kind === 'vitest'
					? `${issue.testName ?? ''}:${issue.file}:${issue.line}:${issue.message}`
					: `${issue.kind}:${issue.message}:${issue.context ?? ''}`;

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
}

export function formatCommandError({
	stepName,
	stdout = '',
	stderr = '',
	exitCode = 1,
}) {
	const combined = stripAnsi(`${stdout}\n${stderr}`);
	const issues = dedupeIssues([
		...parseTypeScriptIssues(combined),
		...parseAngularIssues(combined),
		...parseVitestIssues(combined),
		...parseNpmIssues(combined),
	]);

	const tsIssues = issues.filter((issue) => issue.kind === 'typescript');
	const vitestIssues = issues.filter((issue) => issue.kind === 'vitest');
	const primaryIssues =
		tsIssues.length > 0
			? [...tsIssues, ...issues.filter((issue) => issue.kind === 'npm')]
			: vitestIssues.length > 0
				? vitestIssues
				: issues;
	const finalIssues = primaryIssues;

	if (finalIssues.length > 0) {
		const tsCount = finalIssues.filter(
			(i) => i.kind === 'typescript',
		).length;
		const vitestCount = finalIssues.filter(
			(i) => i.kind === 'vitest',
		).length;
		const summary =
			tsCount > 0
				? `${tsCount} TypeScript error(s) in ${stepName}`
				: vitestCount > 0
					? `${vitestCount} test failure(s) in ${stepName}`
					: `${finalIssues.length} error(s) in ${stepName}`;

		return new BuildError(
			stepName,
			summary,
			{
				issues: finalIssues.slice(0, 20),
				hint: buildHint(finalIssues, stepName),
				rawTail: tailLines(combined),
			},
			exitCode,
		);
	}

	const summary = extractFallbackSummary(combined, stepName, exitCode);

	return new BuildError(
		stepName,
		summary,
		{
			rawTail: tailLines(combined),
			hint: 'Re-run with verbose output: set BUILD_VERBOSE=1',
		},
		exitCode,
	);
}

export function formatSpawnError(error, stepName) {
	const message = error instanceof Error ? error.message : String(error);

	return new BuildError(
		stepName,
		`Could not start build process: ${message}`,
		{
			hint: 'Check that Node.js and npm are installed and available in PATH.',
		},
		1,
	);
}

function extractFallbackSummary(output, stepName, exitCode) {
	const lines = output
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

	const failedLine = [...lines]
		.reverse()
		.find((line) => /error|failed|cannot find|not found/i.test(line));

	if (failedLine) {
		return `${stepName} exited with code ${exitCode}: ${failedLine}`;
	}

	return `${stepName} exited with code ${exitCode}`;
}

function buildHint(issues, stepName) {
	if (stepName.startsWith('vitest:')) {
		const suite = stepName.replace('vitest:', '');
		return `Re-run suite: node build/test.mjs --${suite}`;
	}

	const kinds = new Set(issues.map((i) => i.kind));

	if (kinds.has('typescript')) {
		return `Run typecheck for this package: npm run typecheck -w ${stepName}`;
	}

	if (kinds.has('angular')) {
		return 'Run UI typecheck: npm run typecheck -w @langflower/ui';
	}

	if (kinds.has('npm')) {
		return 'Ensure dependencies are installed: bash build/install.sh';
	}

	if (kinds.has('vitest')) {
		return 'Re-run failed suite: node build/test.mjs --unit (or --integration)';
	}

	return undefined;
}

export function printFatalError(error) {
	if (error instanceof BuildError) {
		error.print();
		return;
	}

	log.error(error instanceof Error ? error.message : String(error));

	if (error instanceof Error && error.stack) {
		log.blank();
		log.info('Stack trace:');
		process.stderr.write(`${cDim(error.stack)}\n`);
	}
}
