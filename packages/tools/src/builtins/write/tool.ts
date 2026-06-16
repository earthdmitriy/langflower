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
			'write requires string arguments «path» and «content».',
		);
	}

	const absolute = resolveProjectPath(
		ctx.projectRoot,
		userPath,
		fenceOptions(ctx),
	);
	await fs.mkdir(path.dirname(absolute), { recursive: true });
	await fs.writeFile(absolute, content, 'utf8');
	return `Wrote «${userPath}» (${content.length} chars).`;
};

export const writeTool = {
	id: 'write',
	registration: {
		toolId: 'write',
		name: 'write',
		description:
			'Write or overwrite a file (creates parent directories). Prefer create for new-only files.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Project-relative file path',
				},
				content: {
					type: 'string',
					description: 'Full file contents',
				},
			},
			required: ['path', 'content'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'write'>;
