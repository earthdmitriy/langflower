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
import { runGrepCascade } from './search.js';

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const pattern = asString(args, 'pattern');

	if (pattern === undefined) {
		throw new Error('grep requires string argument «pattern».');
	}

	const searchPath = asString(args, 'path') ?? '.';
	const respectGitignore = asBoolean(args, 'respectGitignore', true);
	const caseInsensitive = asBoolean(args, 'caseInsensitive', false);
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

	const { body } = await runGrepCascade({
		pattern,
		caseInsensitive,
		respectGitignore,
		searchAbsolute: absolute,
		fenceRoot,
		displayPath: (fileAbs) => displayPath(ctx, fileAbs),
		...(ctx.signal !== undefined ? { signal: ctx.signal } : {}),
	});

	return applyPostProcess(args, body);
};

export const grepTool = {
	id: 'grep',
	registration: {
		toolId: 'grep',
		name: 'grep',
		description:
			'Regex search across project files (gitignore-aware by default; ripgrep when available, else grep, else bounded Node walk). Optional postProcess.',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description:
						'Regex pattern (ripgrep dialect when rg is available; JavaScript RegExp on Node fallback)',
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
