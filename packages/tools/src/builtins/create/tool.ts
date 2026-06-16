import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from '../../path-sandbox.js';
import { asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const userPath = asString(args, 'path');
	const content = asString(args, 'content');

	if (userPath === undefined || content === undefined) {
		throw new Error(
			'create requires string arguments «path» and «content».',
		);
	}

	const absolute = resolveProjectPath(
		ctx.projectRoot,
		userPath,
		fenceOptions(ctx),
	);

	try {
		await fs.access(absolute);
		throw new Error(
			`create failed: «${userPath}» already exists. Use write to overwrite or choose another path.`,
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith('create failed:')
		) {
			throw error;
		}

		const code =
			error !== null && typeof error === 'object' && 'code' in error
				? String((error as { code: unknown }).code)
				: '';

		if (code !== 'ENOENT') {
			throw error;
		}
	}

	await fs.mkdir(path.dirname(absolute), { recursive: true });
	await fs.writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' });
	return `Created «${userPath}» (${content.length} chars).`;
};

export const createTool = {
	id: 'create',
	registration: {
		toolId: 'create',
		name: 'create',
		description:
			'Create a new file. Fails if the path already exists (use write to overwrite).',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Project-relative file path',
				},
				content: {
					type: 'string',
					description: 'Initial file contents',
				},
			},
			required: ['path', 'content'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'create'>;
