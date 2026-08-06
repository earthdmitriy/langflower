import fs from 'node:fs/promises';
import path from 'node:path';
import { commandExists } from '../command-exists.js';
import {
	spawnCapture,
	type SpawnCaptureOptions,
	type SpawnCaptureResult,
} from '../spawn-capture.js';
import { WALK_EXCLUDE_DIR_NAMES, walkFiles } from '../walk-files.js';

export const MAX_GREP_MATCHES = 100;
const MAX_GREP_FILES_SCANNED = 5_000;
const MAX_GREP_FILE_BYTES = 1_048_576;
const MAX_GREP_LINE_CHARS = 8_000;

const SEARCH_EXCLUDE_GLOBS = [
	'!**/node_modules/**',
	'!**/dist/**',
	'!**/build/**',
	'!**/.git/**',
] as const;

type GrepHit = {
	readonly file: string;
	readonly line: number;
	readonly text: string;
};

export type GrepSearchInput = {
	readonly pattern: string;
	readonly caseInsensitive: boolean;
	readonly respectGitignore: boolean;
	/** Absolute search file or directory (already fenced). */
	readonly searchAbsolute: string;
	/** Fence root for relative display paths. */
	readonly fenceRoot: string;
	readonly displayPath: (absolute: string) => string;
	readonly signal?: AbortSignal;
};

export type GrepSearchDeps = {
	readonly commandExists?: (cmd: string) => Promise<boolean>;
	readonly spawnCapture?: (
		command: string,
		args: readonly string[],
		options?: SpawnCaptureOptions,
	) => Promise<SpawnCaptureResult>;
};

type GrepSearchOutcome =
	| {
			readonly ok: true;
			readonly hits: readonly GrepHit[];
			readonly truncated: boolean;
			readonly backend: 'rg' | 'grep' | 'node';
	  }
	| {
			readonly ok: false;
			readonly reason: 'unavailable' | 'error';
			readonly message: string;
	  };

const throwIfAborted = (signal: AbortSignal | undefined): void => {
	if (signal?.aborted) {
		throw new Error('aborted');
	}
};

const formatHits = (hits: readonly GrepHit[], truncated: boolean): string => {
	if (hits.length === 0) {
		return '(no matches)';
	}

	const body = hits
		.map((hit) => `${hit.file}:${hit.line}:${hit.text}`)
		.join('\n');

	return truncated
		? `${body}\n…[truncated at ${MAX_GREP_MATCHES}; refine pattern or path]`
		: body;
};

const formatGrepBody = (hits: readonly GrepHit[], truncated: boolean): string =>
	formatHits(hits, truncated);

const parseLineHits = (
	stdout: string,
	displayPath: (absolute: string) => string,
	fenceRoot: string,
	maxHits: number,
): { readonly hits: GrepHit[]; readonly truncated: boolean } => {
	const hits: GrepHit[] = [];
	const lines = stdout.split(/\r?\n/);

	for (const raw of lines) {
		if (raw.length === 0) {
			continue;
		}

		const match = /^(.+?):(\d+):(.*)$/.exec(raw);

		if (match === null) {
			continue;
		}

		const fileAbs = path.isAbsolute(match[1] ?? '')
			? (match[1] ?? '')
			: path.join(fenceRoot, match[1] ?? '');
		const line = Number(match[2]);
		const text = match[3] ?? '';

		if (!Number.isFinite(line)) {
			continue;
		}

		hits.push({
			file: displayPath(fileAbs),
			line,
			text:
				text.length > MAX_GREP_LINE_CHARS
					? `${text.slice(0, MAX_GREP_LINE_CHARS)}…`
					: text,
		});

		if (hits.length >= maxHits) {
			return { hits, truncated: true };
		}
	}

	return { hits, truncated: false };
};

const isBinaryAbortError = (error: unknown): boolean =>
	error instanceof Error &&
	(error.name === 'AbortError' || error.message === 'aborted');

const searchWithRipgrep = async (
	input: GrepSearchInput,
	deps: GrepSearchDeps = {},
): Promise<GrepSearchOutcome> => {
	const exists = deps.commandExists ?? commandExists;
	const run = deps.spawnCapture ?? spawnCapture;

	if (!(await exists('rg'))) {
		return {
			ok: false,
			reason: 'unavailable',
			message: 'ripgrep (rg) is not available on this system',
		};
	}

	throwIfAborted(input.signal);

	const args = [
		'-n',
		'--color',
		'never',
		'--max-filesize',
		`${MAX_GREP_FILE_BYTES}`,
		...(input.respectGitignore ? [] : ['--no-ignore']),
		...SEARCH_EXCLUDE_GLOBS.flatMap((glob) => ['--glob', glob]),
		...(input.caseInsensitive ? ['-i'] : []),
		'-e',
		input.pattern,
		input.searchAbsolute,
	];

	try {
		const result = await run('rg', args, {
			cwd: input.fenceRoot,
			...(input.signal !== undefined ? { signal: input.signal } : {}),
		});

		// rg: 0 = matches, 1 = no matches, 2 = error
		if (result.code !== null && result.code >= 2) {
			const detail = result.stderr.trim();
			return {
				ok: false,
				reason: 'error',
				message:
					detail.length > 0
						? `ripgrep failed: ${detail}`
						: 'ripgrep failed',
			};
		}

		const parsed = parseLineHits(
			result.stdout,
			input.displayPath,
			input.fenceRoot,
			MAX_GREP_MATCHES,
		);

		return {
			ok: true,
			hits: parsed.hits,
			truncated: parsed.truncated,
			backend: 'rg',
		};
	} catch (error) {
		if (isBinaryAbortError(error)) {
			throw new Error('aborted');
		}

		return {
			ok: false,
			reason: 'unavailable',
			message:
				error instanceof Error
					? error.message
					: 'Error executing ripgrep',
		};
	}
};

const searchWithGrep = async (
	input: GrepSearchInput,
	deps: GrepSearchDeps = {},
): Promise<GrepSearchOutcome> => {
	const exists = deps.commandExists ?? commandExists;
	const run = deps.spawnCapture ?? spawnCapture;

	if (!(await exists('grep'))) {
		return {
			ok: false,
			reason: 'unavailable',
			message: 'grep is not available on this system',
		};
	}

	throwIfAborted(input.signal);

	const args = [
		'-r',
		'-n',
		'-E',
		'-I',
		...(input.caseInsensitive ? ['-i'] : []),
		...WALK_EXCLUDE_DIR_NAMES.flatMap((name) => ['--exclude-dir', name]),
		'-e',
		input.pattern,
		input.searchAbsolute,
	];

	try {
		const result = await run('grep', args, {
			cwd: input.fenceRoot,
			...(input.signal !== undefined ? { signal: input.signal } : {}),
		});

		// grep: 0 = matches, 1 = no matches, ≥2 = error
		if (result.code !== null && result.code >= 2) {
			const detail = result.stderr.trim();
			return {
				ok: false,
				reason: 'error',
				message:
					detail.length > 0
						? `grep failed: ${detail}`
						: 'grep failed',
			};
		}

		const parsed = parseLineHits(
			result.stdout,
			input.displayPath,
			input.fenceRoot,
			MAX_GREP_MATCHES,
		);

		return {
			ok: true,
			hits: parsed.hits,
			truncated: parsed.truncated,
			backend: 'grep',
		};
	} catch (error) {
		if (isBinaryAbortError(error)) {
			throw new Error('aborted');
		}

		return {
			ok: false,
			reason: 'unavailable',
			message:
				error instanceof Error ? error.message : 'Error executing grep',
		};
	}
};

const looksBinary = (buf: Buffer): boolean => {
	const sample = buf.subarray(0, Math.min(buf.length, 8_192));
	return sample.includes(0);
};

const yieldEventLoop = (): Promise<void> =>
	new Promise((resolve) => {
		setImmediate(resolve);
	});

export const searchWithNodeWalk = async (
	input: GrepSearchInput,
): Promise<GrepSearchOutcome> => {
	throwIfAborted(input.signal);

	let regex: RegExp;

	try {
		regex = new RegExp(input.pattern, input.caseInsensitive ? 'i' : '');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			reason: 'error',
			message: `Invalid regex «${input.pattern}»: ${message}. Escape special characters or simplify the pattern.`,
		};
	}

	const stat = await fs.stat(input.searchAbsolute).catch(() => null);

	if (stat === null) {
		return {
			ok: false,
			reason: 'error',
			message: `Path not found: ${input.searchAbsolute}`,
		};
	}

	const files = stat.isFile()
		? [input.searchAbsolute]
		: (
				await walkFiles(input.fenceRoot, input.searchAbsolute, {
					respectGitignore: input.respectGitignore,
					...(input.signal !== undefined
						? { signal: input.signal }
						: {}),
					maxFiles: MAX_GREP_FILES_SCANNED,
				})
			).map((relative) => path.join(input.fenceRoot, relative));

	const hits: GrepHit[] = [];
	let matchCapHit = false;
	let scanned = 0;

	for (const fileAbs of files) {
		throwIfAborted(input.signal);
		scanned += 1;

		if (scanned % 16 === 0) {
			await yieldEventLoop();
			throwIfAborted(input.signal);
		}

		if (hits.length >= MAX_GREP_MATCHES) {
			matchCapHit = true;
			break;
		}

		let buf: Buffer;

		try {
			const handle = await fs.open(fileAbs, 'r');

			try {
				const st = await handle.stat();

				if (st.size > MAX_GREP_FILE_BYTES) {
					continue;
				}

				buf = Buffer.alloc(Number(st.size));
				await handle.read(buf, 0, buf.length, 0);
			} finally {
				await handle.close();
			}
		} catch {
			continue;
		}

		if (looksBinary(buf)) {
			continue;
		}

		const text = buf.toString('utf8');
		const lines = text.split(/\r?\n/);

		for (let i = 0; i < lines.length; i += 1) {
			let line = lines[i] ?? '';

			if (line.length > MAX_GREP_LINE_CHARS) {
				line = line.slice(0, MAX_GREP_LINE_CHARS);
			}

			if (regex.test(line)) {
				hits.push({
					file: input.displayPath(fileAbs),
					line: i + 1,
					text: line,
				});

				if (hits.length >= MAX_GREP_MATCHES) {
					matchCapHit = true;
					break;
				}
			}
		}
	}

	const fileCapHit = !stat.isFile() && files.length >= MAX_GREP_FILES_SCANNED;

	return {
		ok: true,
		hits,
		truncated: matchCapHit || fileCapHit,
		backend: 'node',
	};
};

/**
 * ts-scan-style cascade: rg → grep → bounded Node walk.
 * Soft-falls through when a CLI binary is missing or fails to spawn;
 * Node tier surfaces invalid JS RegExp errors.
 */
export const runGrepCascade = async (
	input: GrepSearchInput,
	deps: GrepSearchDeps = {},
): Promise<{
	readonly body: string;
	readonly backend: 'rg' | 'grep' | 'node';
}> => {
	throwIfAborted(input.signal);

	const rg = await searchWithRipgrep(input, deps);

	if (rg.ok) {
		return {
			body: formatGrepBody(rg.hits, rg.truncated),
			backend: rg.backend,
		};
	}

	const grep = await searchWithGrep(input, deps);

	if (grep.ok) {
		return {
			body: formatGrepBody(grep.hits, grep.truncated),
			backend: grep.backend,
		};
	}

	const node = await searchWithNodeWalk(input);

	if (!node.ok) {
		throw new Error(node.message);
	}

	return {
		body: formatGrepBody(node.hits, node.truncated),
		backend: node.backend,
	};
};
