import fs from 'node:fs/promises';
import path from 'node:path';
import {
	isSessionUploadMime,
	SESSION_UPLOAD_MAX_BYTES,
} from '@langflower/node-sdk';
import { formatNotFound, resolveProjectPath } from '../../path-sandbox.js';
import { applyPostProcess } from '../apply-post-process.js';
import { asNumber, asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const MAX_READ_CHARS = 200_000;

/**
 * Chat Completions file-input ceiling. A declared size at
 * {@link SESSION_UPLOAD_MAX_BYTES} is refused before the bytes are read.
 */
export const isUnderSessionUploadCeiling = (size: number): boolean =>
	Number.isSafeInteger(size) && size >= 0 && size < SESSION_UPLOAD_MAX_BYTES;

const MEDIA_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.wav': 'audio/wav',
	'.mp3': 'audio/mpeg',
	'.pdf': 'application/pdf',
};

const mediaMimeForPath = (userPath: string): string | undefined => {
	const mimeType =
		MEDIA_MIME_BY_EXTENSION[path.extname(userPath).toLowerCase()];
	if (mimeType === undefined || !isSessionUploadMime(mimeType)) {
		return undefined;
	}
	return mimeType;
};

const readErrorCode = (error: unknown): string =>
	error !== null && typeof error === 'object' && 'code' in error
		? String((error as { code: unknown }).code)
		: '';

const mediaSummary = (
	userPath: string,
	mimeType: string,
	size: number,
): string => `${userPath} (${mimeType}, ${size} bytes)`;

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

const readMedia = async (
	ctx: HandlerContext,
	userPath: string,
	absolute: string,
	mimeType: string,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	let info: Awaited<ReturnType<typeof fs.stat>>;
	try {
		info = await fs.stat(absolute);
	} catch (error) {
		if (readErrorCode(error) === 'ENOENT') {
			throw new Error(await formatNotFound(absolute, userPath));
		}
		throw error;
	}

	if (!info.isFile()) {
		throw new Error(`read refuses "${userPath}": not a file.`);
	}

	if (!isUnderSessionUploadCeiling(info.size)) {
		throw new Error(
			`read refuses "${userPath}": file must be under ${SESSION_UPLOAD_MAX_BYTES} bytes.`,
		);
	}

	if (ctx.stageSessionUpload === undefined) {
		throw new Error(
			`read cannot stage ${mimeType} for "${userPath}": no session upload hook is bound.`,
		);
	}

	const bytes = await fs.readFile(absolute);
	if (!isUnderSessionUploadCeiling(bytes.byteLength)) {
		throw new Error(
			`read refuses "${userPath}": file must be under ${SESSION_UPLOAD_MAX_BYTES} bytes.`,
		);
	}

	const staged = await ctx.stageSessionUpload({
		name: path.basename(userPath),
		mimeType,
		bytes,
	});
	return applyPostProcess(
		args,
		mediaSummary(userPath, staged.mimeType, staged.size),
	);
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

	const mediaMime = mediaMimeForPath(userPath);
	if (mediaMime !== undefined) {
		return readMedia(ctx, userPath, absolute, mediaMime, args);
	}

	let content: string;

	try {
		content = await fs.readFile(absolute, 'utf8');
	} catch (error) {
		if (readErrorCode(error) === 'ENOENT') {
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
			'Read a file under the project root. Optional startLine/endLine (1-based) or offset/limit (byte-ish line slices). Optional postProcess: source of (res: string) => string. png, jpg, jpeg, gif, webp, wav, mp3, and pdf are staged as session uploads; the result is one line with the path, MIME, and size. Other files, including video, stay UTF-8 text.',
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
