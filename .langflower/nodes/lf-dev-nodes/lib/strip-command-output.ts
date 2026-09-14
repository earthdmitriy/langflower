/**
 * Turn captured subprocess output into a short agent-facing string:
 * pass/fail plus failed tests and compiler/linter errors only.
 */

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

export const MAX_ISSUE_LINES = 30;

export const MAX_AGENT_CHARS = 8_000;

const FALLBACK_LINE_COUNT = 15;

const FILE_EXT = String.raw`\.[cm]?[jt]sx?`;

type StripInput = {
	readonly label: string;
	readonly exitCode: number | null;
	readonly timedOut?: boolean;
	readonly stdout: string;
	readonly stderr: string;
};

export const stripAnsi = (text: string): string => text.replace(STRIP_ANSI, '');

const combinedOutput = (input: StripInput): string =>
	stripAnsi(`${input.stdout}\n${input.stderr}`);

const isNoiseLine = (line: string): boolean => {
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

	if (trimmed.includes('✓') || trimmed.startsWith('PASS ')) {
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

const parseBuildErrorIssues = (output: string): readonly string[] => {
	const marker = output.match(/^Issues:$/m);
	if (marker === null || marker.index === undefined) {
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

const parseVitestFails = (output: string): readonly string[] => {
	const issues: string[] = [];
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

const parseTypeScriptIssues = (output: string): readonly string[] => {
	const issues: string[] = [];
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
		if (err === undefined) {
			continue;
		}

		const path = file?.[1] ?? 'unknown';
		const line = file?.[2] ?? '0';
		const column = file?.[3] ?? '0';
		issues.push(
			`${path}:${line}:${column} ${err[1]} ${err[2]?.trim() ?? ''}`,
		);
	}

	return issues;
};

const parseEslintIssues = (output: string): readonly string[] => {
	const errors: string[] = [];
	const warnings: string[] = [];
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

const parsePrettierIssues = (output: string): readonly string[] =>
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

const parseKnipIssues = (output: string): readonly string[] => {
	const trimmed = output.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			return formatKnipJson(parsed);
		} catch {
			// fall through to text sections
		}
	}

	const issues: string[] = [];
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

const formatKnipJson = (value: unknown): readonly string[] => {
	if (typeof value !== 'object' || value === null) {
		return [];
	}

	const record = value as Record<string, unknown>;
	const issues: string[] = [];
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
				const row = item as Record<string, unknown>;
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

const parseNpmIssues = (output: string): readonly string[] => {
	const issues: string[] = [];
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

const dedupe = (lines: readonly string[]): readonly string[] => {
	const seen = new Set<string>();
	const result: string[] = [];
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

const fallbackLines = (output: string): readonly string[] =>
	output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !isNoiseLine(line))
		.slice(-FALLBACK_LINE_COUNT);

const collectIssues = (output: string): readonly string[] => {
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

const capIssues = (
	lines: readonly string[],
): { readonly text: string; readonly omitted: number } => {
	const omitted = Math.max(0, lines.length - MAX_ISSUE_LINES);
	const kept = omitted > 0 ? lines.slice(0, MAX_ISSUE_LINES) : lines;
	const withNote =
		omitted > 0
			? [...kept, `… ${String(omitted)} more issues omitted`]
			: kept;
	return { text: withNote.join('\n'), omitted };
};

const capChars = (text: string): string => {
	if (text.length <= MAX_AGENT_CHARS) {
		return text;
	}

	return `${text.slice(0, MAX_AGENT_CHARS - 24)}\n… truncated`;
};

/**
 * Compact pass/fail text for an LLM tool result.
 */
export const stripCommandOutput = (input: StripInput): string => {
	if (input.timedOut === true) {
		const body = capIssues(collectIssues(combinedOutput(input))).text;
		const header = `failed  ${input.label}  (timeout)`;
		return capChars(body.length > 0 ? `${header}\n${body}` : header);
	}

	if (input.exitCode === 0) {
		return `ok  ${input.label}`;
	}

	const header = `failed  ${input.label}  (exit ${String(input.exitCode ?? 1)})`;
	const body = capIssues(collectIssues(combinedOutput(input))).text;
	return capChars(body.length > 0 ? `${header}\n${body}` : header);
};
