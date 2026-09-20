import fs from 'node:fs/promises';
import path from 'node:path';
import { formatNotFound, resolveProjectPath } from '../../path-sandbox.js';
import { asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const errorCode = (error: unknown): string =>
	error !== null && typeof error === 'object' && 'code' in error
		? String((error as { code: unknown }).code)
		: '';

const isInsideDirectory = (parent: string, child: string): boolean => {
	const relative = path.relative(parent, child);
	return (
		relative !== '' &&
		!relative.startsWith('..') &&
		!path.isAbsolute(relative)
	);
};

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const fromPath = asString(args, 'from');
	const toPath = asString(args, 'to');

	if (fromPath === undefined || toPath === undefined) {
		throw new Error('move requires string arguments «from» and «to».');
	}

	const fromAbs = resolveProjectPath(
		ctx.projectRoot,
		fromPath,
		fenceOptions(ctx),
	);
	const toAbs = resolveProjectPath(
		ctx.projectRoot,
		toPath,
		fenceOptions(ctx),
	);

	if (fromAbs === toAbs) {
		return `Already at «${fromPath}».`;
	}

	let fromStat: Awaited<ReturnType<typeof fs.lstat>>;

	try {
		fromStat = await fs.lstat(fromAbs);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') {
			throw new Error(await formatNotFound(fromAbs, fromPath));
		}

		throw error;
	}

	try {
		const toStat = await fs.lstat(toAbs);
		const kind = toStat.isDirectory() ? 'directory' : 'file';
		throw new Error(
			`move failed: «${toPath}» already exists (${kind}). Delete or rename it first, then retry.`,
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith('move failed:')
		) {
			throw error;
		}

		if (errorCode(error) !== 'ENOENT') {
			throw error;
		}
	}

	if (fromStat.isDirectory() && isInsideDirectory(fromAbs, toAbs)) {
		throw new Error(
			`move failed: destination «${toPath}» is inside source directory «${fromPath}».`,
		);
	}

	await fs.mkdir(path.dirname(toAbs), { recursive: true });

	try {
		await fs.rename(fromAbs, toAbs);
	} catch (error) {
		if (errorCode(error) !== 'EXDEV') {
			throw error;
		}

		await fs.cp(fromAbs, toAbs, { recursive: true });
		await fs.rm(fromAbs, { recursive: true, force: true });
	}

	return `Moved «${fromPath}» → «${toPath}».`;
};

export const moveTool = {
	id: 'move',
	registration: {
		toolId: 'move',
		name: 'move',
		description:
			'Move or rename a file or directory under the project root. Fails if the destination exists (delete or rename it first). Prefer this over bash mv/ren/Move-Item. Both from and to must be the full path (not a parent directory).',
		inputSchema: {
			type: 'object',
			properties: {
				from: {
					type: 'string',
					description: 'Project-relative source file or directory',
				},
				to: {
					type: 'string',
					description:
						'Project-relative destination path (full new path, not a parent folder)',
				},
			},
			required: ['from', 'to'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'move'>;
