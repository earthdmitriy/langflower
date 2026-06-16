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
	const oldString = asString(args, 'oldString');
	const newString = asString(args, 'newString');

	if (
		userPath === undefined ||
		oldString === undefined ||
		newString === undefined
	) {
		throw new Error(
			'edit requires string arguments «path», «oldString», and «newString».',
		);
	}

	if (oldString.length === 0) {
		throw new Error('edit «oldString» must not be empty.');
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

	const parts = content.split(oldString);

	if (parts.length === 1) {
		throw new Error(
			`edit: oldString not found in «${userPath}». Provide an exact unique match.`,
		);
	}

	if (parts.length > 2) {
		throw new Error(
			`edit: oldString matched ${parts.length - 1} times in «${userPath}». Provide a longer unique snippet.`,
		);
	}

	await fs.writeFile(absolute, parts.join(newString), 'utf8');
	return `Edited «${userPath}» (1 replacement).`;
};

export const editTool = {
	id: 'edit',
	registration: {
		toolId: 'edit',
		name: 'edit',
		description:
			'Exact string replace in a file. Fails if oldString is missing or not unique.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Project-relative file path',
				},
				oldString: {
					type: 'string',
					description: 'Exact text to find',
				},
				newString: {
					type: 'string',
					description: 'Replacement text',
				},
			},
			required: ['path', 'oldString', 'newString'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'edit'>;
