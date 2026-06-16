import path from 'node:path';
import { resolveFenceRoot, resolveProjectPath } from '../../path-sandbox.js';
import { applyPostProcess } from '../apply-post-process.js';
import { asBoolean, asString } from '../args.js';
import { displayPath, fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';
import { globToRegExp, walkFiles } from '../walk-files.js';

const MAX_GLOB_MATCHES = 200;

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const pattern = asString(args, 'pattern');

	if (pattern === undefined) {
		throw new Error('glob requires string argument «pattern».');
	}

	const cwdArg = asString(args, 'cwd') ?? '.';
	const respectGitignore = asBoolean(args, 'respectGitignore', true);
	const searchRoot = resolveProjectPath(
		ctx.projectRoot,
		cwdArg,
		fenceOptions(ctx),
	);
	const fenceRoot =
		resolveFenceRoot(ctx.projectRoot, searchRoot, ctx.allowedRoots) ??
		path.resolve(ctx.projectRoot);
	const files = await walkFiles(fenceRoot, searchRoot, respectGitignore);
	const regex = globToRegExp(pattern.replace(/\\/g, '/'));
	const searchRel = path
		.relative(fenceRoot, searchRoot)
		.split(path.sep)
		.join('/');
	const cwdPrefix =
		searchRel === '' ? '' : `${searchRel.replace(/\/$/, '')}/`;
	const matches = files
		.filter((file) => {
			const relativeToCwd = cwdPrefix
				? file.startsWith(cwdPrefix)
					? file.slice(cwdPrefix.length)
					: null
				: file;
			return relativeToCwd !== null && regex.test(relativeToCwd);
		})
		.map((file) => displayPath(ctx, path.join(fenceRoot, file)))
		.slice(0, MAX_GLOB_MATCHES + 1);

	const truncated = matches.length > MAX_GLOB_MATCHES;
	const listed = matches.slice(0, MAX_GLOB_MATCHES);
	const body =
		listed.length === 0
			? '(no matches)'
			: listed.join('\n') +
				(truncated
					? `\n…[truncated at ${MAX_GLOB_MATCHES}; narrow the pattern]`
					: '');

	return applyPostProcess(args, body);
};

export const globTool = {
	id: 'glob',
	registration: {
		toolId: 'glob',
		name: 'glob',
		description:
			'List files matching a glob under the project root (gitignore-aware by default). Optional postProcess.',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'Glob pattern, e.g. **/*.ts',
				},
				cwd: {
					type: 'string',
					description:
						'Optional subdirectory relative to project root',
				},
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
} as const satisfies BuiltinTool<'glob'>;
