import fs from 'node:fs/promises';
import { formatNotFound, resolveProjectPath } from '../../path-sandbox.js';
import { applyPostProcess } from '../apply-post-process.js';
import { asNumber, asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const MAX_READ_CHARS = 200_000;

const sliceLines = (
	content: string,
	args: Readonly<Record<string, unknown>>,
): string => {
	const lines = content.split(/\r?\n/);
	const startLine = asNumber(args, 'startLine');
	const endLine = asNumber(args, 'endLine');
	const offset = asNumber(args, 'offset');
	const limit = asNumber(args, 'limit');

	let start = 0;
	let end = lines.length;

	if (startLine !== undefined) {
		start = Math.max(0, Math.floor(startLine) - 1);
	} else if (offset !== undefined) {
		start = Math.max(0, Math.floor(offset));
	}

	if (endLine !== undefined) {
		end = Math.min(lines.length, Math.floor(endLine));
	} else if (limit !== undefined) {
		end = Math.min(lines.length, start + Math.max(0, Math.floor(limit)));
	}

	const sliced = lines.slice(start, end).join('\n');
	const truncated =
		sliced.length > MAX_READ_CHARS
			? `${sliced.slice(0, MAX_READ_CHARS)}\n…[truncated at ${MAX_READ_CHARS} chars]`
			: sliced;

	if (end < lines.length || start > 0) {
		return `${truncated}\n\n[lines ${start + 1}-${Math.min(end, lines.length)} of ${lines.length}; continue with startLine=${end + 1}]`;
	}

	return truncated;
};

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const userPath = asString(args, 'path');

	if (userPath === undefined) {
		throw new Error('read requires string argument «path».');
	}

	const absolute = resolveProjectPath(
		ctx.projectRoot,
		userPath,
		fenceOptions(ctx),
	);

	let content: string;

	try {
		content = await fs.readFile(absolute, 'utf8');
	} catch (error) {
		const code =
			error !== null && typeof error === 'object' && 'code' in error
				? String((error as { code: unknown }).code)
				: '';

		if (code === 'ENOENT') {
			throw new Error(await formatNotFound(absolute, userPath));
		}

		throw error;
	}

	return applyPostProcess(args, sliceLines(content, args));
};

export const readTool = {
	id: 'read',
	registration: {
		toolId: 'read',
		name: 'read',
		description:
			'Read a file under the project root. Optional startLine/endLine (1-based) or offset/limit (byte-ish line slices). Optional postProcess: source of (res: string) => string.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Project-relative file path',
				},
				startLine: {
					type: 'number',
					description: '1-based start line',
				},
				endLine: {
					type: 'number',
					description: '1-based end line (inclusive)',
				},
				offset: {
					type: 'number',
					description: '0-based line offset',
				},
				limit: {
					type: 'number',
					description: 'Max lines to return',
				},
				postProcess: {
					type: 'string',
					description:
						'Optional source of (res: string) => string applied after a successful read',
				},
			},
			required: ['path'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'read'>;
