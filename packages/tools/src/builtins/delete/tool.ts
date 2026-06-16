import fs from 'node:fs/promises';
import { formatNotFound, resolveProjectPath } from '../../path-sandbox.js';
import { asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	const userPath = asString(args, 'path');

	if (userPath === undefined) {
		throw new Error('delete requires string argument «path».');
	}

	const absolute = resolveProjectPath(
		ctx.projectRoot,
		userPath,
		fenceOptions(ctx),
	);

	try {
		await fs.unlink(absolute);
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

	return `Deleted «${userPath}».`;
};

export const deleteTool = {
	id: 'delete',
	registration: {
		toolId: 'delete',
		name: 'delete',
		description: 'Delete a file under the project root.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Project-relative file path',
				},
			},
			required: ['path'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'delete'>;
