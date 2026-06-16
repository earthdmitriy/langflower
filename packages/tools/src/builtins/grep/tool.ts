import fs from 'node:fs/promises';
import path from 'node:path';
import {
	formatNotFound,
	resolveFenceRoot,
	resolveProjectPath,
} from '../../path-sandbox.js';
import { applyPostProcess } from '../apply-post-process.js';
import { asBoolean, asString } from '../args.js';
import { displayPath, fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';
import { walkFiles } from '../walk-files.js';

const MAX_GREP_MATCHES = 100;

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const pattern = asString(args, 'pattern');

	if (pattern === undefined) {
		throw new Error('grep requires string argument «pattern».');
	}

	let regex: RegExp;

	try {
		regex = new RegExp(
			pattern,
			asBoolean(args, 'caseInsensitive', false) ? 'i' : '',
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Invalid regex «${pattern}»: ${message}. Escape special characters or simplify the pattern.`,
		);
	}

	const searchPath = asString(args, 'path') ?? '.';
	const respectGitignore = asBoolean(args, 'respectGitignore', true);
	const absolute = resolveProjectPath(
		ctx.projectRoot,
		searchPath,
		fenceOptions(ctx),
	);
	const stat = await fs.stat(absolute).catch(() => null);

	if (stat === null) {
		throw new Error(await formatNotFound(absolute, searchPath));
	}

	const fenceRoot =
		resolveFenceRoot(ctx.projectRoot, absolute, ctx.allowedRoots) ??
		path.resolve(ctx.projectRoot);
	const files = stat.isFile()
		? [displayPath(ctx, absolute)]
		: (await walkFiles(fenceRoot, absolute, respectGitignore)).map((file) =>
				displayPath(ctx, path.join(fenceRoot, file)),
			);

	const hits: string[] = [];

	for (const file of files) {
		if (hits.length >= MAX_GREP_MATCHES) {
			break;
		}

		const fileAbs = resolveProjectPath(
			ctx.projectRoot,
			file,
			fenceOptions(ctx),
		);
		let text: string;

		try {
			text = await fs.readFile(fileAbs, 'utf8');
		} catch {
			continue;
		}

		const lines = text.split(/\r?\n/);

		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] ?? '';

			if (regex.test(line)) {
				hits.push(`${file}:${i + 1}:${line}`);
				if (hits.length >= MAX_GREP_MATCHES) {
					break;
				}
			}
		}
	}

	const body =
		hits.length === 0
			? '(no matches)'
			: hits.join('\n') +
				(hits.length >= MAX_GREP_MATCHES
					? `\n…[truncated at ${MAX_GREP_MATCHES}; refine pattern or path]`
					: '');

	return applyPostProcess(args, body);
};

export const grepTool = {
	id: 'grep',
	registration: {
		toolId: 'grep',
		name: 'grep',
		description:
			'Regex search across project files (gitignore-aware by default; Node walk — not ripgrep). Optional postProcess.',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'JavaScript RegExp source',
				},
				path: {
					type: 'string',
					description: 'Optional subdirectory or file to search',
				},
				caseInsensitive: { type: 'boolean' },
				respectGitignore: {
					type: 'boolean',
					description: 'Default true',
				},
				postProcess: {
					type: 'string',
					description: 'Optional source of (res: string) => string',
				},
			},
			required: ['pattern'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'grep'>;
