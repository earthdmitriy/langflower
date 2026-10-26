import type { IncomingMessage } from 'node:http';
import {
	isSessionUploadMime,
	SESSION_UPLOAD_MAX_BYTES,
	SESSION_UPLOAD_MIME_TYPES,
	type HitlUploadedFile,
} from '@langflower/node-sdk';

export { isSessionUploadMime, SESSION_UPLOAD_MIME_TYPES };

/**
 * Provider ceiling, owned next to `HitlUploadedFile`. Each file must be
 * under 50 MB. The files cited by one chat request must total at most
 * 50 MB. `express.raw` on the upload route uses this same value.
 */
export { SESSION_UPLOAD_MAX_BYTES };

/** `POST` one raw body. `GET ${SESSION_UPLOAD_ROUTE}/:fileId` serves it. */
export const SESSION_UPLOAD_ROUTE = '/api/session-uploads';

/**
 * Original file name. The wire header is `X-Langflower-File-Name`.
 * Express lowercases the lookup key.
 */
export const SESSION_UPLOAD_NAME_HEADER = 'x-langflower-file-name';

const UPLOAD_FILE_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const firstHeader = (header: string | string[] | undefined): string => {
	const raw = Array.isArray(header) ? header[0] : header;
	return typeof raw === 'string' ? raw.trim() : '';
};

/** `Content-Type` as sent, with surrounding whitespace removed. No parameter strip. */
export const sessionUploadContentType = firstHeader;

/**
 * Trimmed original name, or `undefined` when the header is empty or
 * contains a control character. The name is metadata, not a path segment.
 */
export const sessionUploadFileName = (
	header: string | string[] | undefined,
): string | undefined => {
	const name = firstHeader(header);
	if (name.length === 0 || /[\u0000-\u001F\u007F]/.test(name)) {
		return undefined;
	}
	return name;
};

/** Lowercase UUID. The disk name is this id, never the user's file name. */
export const isSessionUploadFileId = (fileId: string): boolean =>
	UPLOAD_FILE_ID.test(fileId);

/**
 * `Content-Length` when it is a safe integer. Anything else is left to
 * the raw parser.
 */
export const sessionUploadDeclaredLength = (
	header: string | string[] | undefined,
): number | undefined => {
	const raw = firstHeader(header);
	if (!/^\d+$/.test(raw)) {
		return undefined;
	}

	const value = Number(raw);
	return Number.isSafeInteger(value) ? value : undefined;
};

/** `true` when `size` is under the ceiling. The ceiling itself is refused. */
export const sessionUploadByteLengthAllowed = (
	size: number,
	maxBytes: number = SESSION_UPLOAD_MAX_BYTES,
): boolean => size >= 0 && size < maxBytes;

export const createSessionUploadRawOptions = (
	maxBytes: number = SESSION_UPLOAD_MAX_BYTES,
): {
	readonly limit: number;
	readonly type: (req: IncomingMessage) => boolean;
} => ({
	limit: maxBytes,
	type: (req) =>
		isSessionUploadMime(
			sessionUploadContentType(req.headers['content-type']),
		),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Meta written beside the bytes so `GET` can set `Content-Type`. */
export const uploadedFileFromMeta = (
	raw: unknown,
	fileId: string,
	byteLength: number,
): HitlUploadedFile | undefined => {
	if (!isRecord(raw)) {
		return undefined;
	}

	if (
		raw.fileId !== fileId ||
		typeof raw.name !== 'string' ||
		raw.name.length === 0 ||
		typeof raw.mimeType !== 'string' ||
		!isSessionUploadMime(raw.mimeType) ||
		raw.size !== byteLength
	) {
		return undefined;
	}

	return {
		fileId,
		name: raw.name,
		mimeType: raw.mimeType,
		size: byteLength,
	};
};
