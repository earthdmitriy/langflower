import {
	isSessionUploadMime,
	SESSION_UPLOAD_MIME_TYPES,
	type HitlUploadedFile,
} from '@langflower/node-sdk';

/**
 * Same path as server `SESSION_UPLOAD_ROUTE`. Relative so the page origin
 * is the API: the server when it serves the UI, and the dev proxy when
 * the UI is on port 4200.
 */
export const SESSION_UPLOAD_PATH = '/api/session-uploads';

/**
 * Same header as server `SESSION_UPLOAD_NAME_HEADER`
 * (`X-Langflower-File-Name`). Fetch sends this name; Express lowercases it.
 */
export const SESSION_UPLOAD_NAME_HEADER = 'x-langflower-file-name';

/** `<input accept>` for the composer file control. */
export const SESSION_UPLOAD_ACCEPT = SESSION_UPLOAD_MIME_TYPES.join(',');

export const sessionUploadUrl = (fileId: string): string =>
	`${SESSION_UPLOAD_PATH}/${encodeURIComponent(fileId)}`;

/** Image MIME from the shared allowlist. Audio and PDF are not images. */
export const isSessionUploadImageMime = (mime: string): boolean =>
	isSessionUploadMime(mime) && mime.startsWith('image/');

/**
 * Drop anything whose `type` is outside the allowlist, including `''`.
 * The extension does not replace an empty MIME.
 */
export const acceptUploadFiles = <T extends { readonly type: string }>(
	files: readonly T[],
): readonly T[] => files.filter((file) => isSessionUploadMime(file.type));

/** Append only accepted picks. Rejected files never enter the draft. */
export const appendAcceptedUploads = <T extends { readonly type: string }>(
	draft: readonly T[],
	picked: readonly T[],
): readonly T[] => [...draft, ...acceptUploadFiles(picked)];

export type SessionUploadPostResult =
	| { readonly ok: true; readonly file: HitlUploadedFile }
	| { readonly ok: false; readonly message: string };

const isUploadedFile = (value: unknown): value is HitlUploadedFile => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	if (
		!('fileId' in value) ||
		!('name' in value) ||
		!('mimeType' in value) ||
		!('size' in value)
	) {
		return false;
	}

	const { fileId, name, mimeType, size } = value;
	return (
		typeof fileId === 'string' &&
		fileId.length > 0 &&
		typeof name === 'string' &&
		name.length > 0 &&
		typeof mimeType === 'string' &&
		isSessionUploadMime(mimeType) &&
		typeof size === 'number'
	);
};

const failureMessage = (body: unknown): string => {
	if (
		typeof body === 'object' &&
		body !== null &&
		'message' in body &&
		typeof body.message === 'string' &&
		body.message.length > 0
	) {
		return body.message;
	}

	return 'Upload failed';
};

/** `POST` one raw body. Callers must already have passed the MIME gate. */
export const postSessionUpload = async (file: {
	readonly type: string;
	readonly name: string;
	readonly body: Blob;
}): Promise<SessionUploadPostResult> => {
	let response: Response;
	try {
		response = await fetch(SESSION_UPLOAD_PATH, {
			method: 'POST',
			headers: {
				'Content-Type': file.type,
				[SESSION_UPLOAD_NAME_HEADER]: file.name,
			},
			body: file.body,
		});
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : 'Upload failed',
		};
	}

	if (!response.ok) {
		const body: unknown = await response.json().catch(() => undefined);
		return { ok: false, message: failureMessage(body) };
	}

	const body: unknown = await response.json().catch(() => undefined);
	if (!isUploadedFile(body)) {
		return { ok: false, message: 'Upload failed' };
	}

	return {
		ok: true,
		file: {
			fileId: body.fileId,
			name: body.name,
			mimeType: body.mimeType,
			size: body.size,
		},
	};
};

/**
 * `POST` accepted files in order. A rejected MIME never reaches `post`.
 * The first failed `POST` stops the turn; earlier responses are not sent.
 */
export const stageComposerUploads = async <T extends { readonly type: string }>(
	files: readonly T[],
	post: (file: T) => Promise<SessionUploadPostResult>,
): Promise<
	| { readonly ok: true; readonly files: readonly HitlUploadedFile[] }
	| { readonly ok: false; readonly message: string }
> => {
	const accepted = acceptUploadFiles(files);
	const uploaded: HitlUploadedFile[] = [];
	for (const file of accepted) {
		const result = await post(file);
		if (!result.ok) {
			return result;
		}
		uploaded.push(result.file);
	}

	return { ok: true, files: uploaded };
};

/** The slice of `DataTransfer` that paste and drop read. */
export type UploadTransfer = {
	readonly items?: ArrayLike<{
		readonly kind: string;
		getAsFile(): File | null;
	}>;
	readonly files?: ArrayLike<File>;
};

const MIME_EXTENSION: Readonly<Record<string, string>> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'audio/wav': 'wav',
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'application/pdf': 'pdf',
};

/** Browsers name every screenshot `image.png`. */
const GENERIC_CLIPBOARD_NAME = /^image\.[a-z0-9]+$/i;

const transferFiles = (data: UploadTransfer | null): readonly File[] => {
	if (data === null) {
		return [];
	}

	const fromItems = Array.from(data.items ?? [])
		.filter((item) => item.kind === 'file')
		.flatMap((item) => item.getAsFile() ?? []);

	return fromItems.length > 0 ? fromItems : Array.from(data.files ?? []);
};

/**
 * Allowlisted files on a paste. A generic `image.png` becomes
 * `pasted-<HHMMSS>-<n>.png` so two pastes stay apart in the strip.
 */
export const clipboardUploadFiles = (
	data: UploadTransfer | null,
	now: Date = new Date(),
): readonly File[] => {
	const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()]
		.map((part) => String(part).padStart(2, '0'))
		.join('');

	return acceptUploadFiles(transferFiles(data)).map((file, index) =>
		GENERIC_CLIPBOARD_NAME.test(file.name)
			? new File(
					[file],
					`pasted-${stamp}-${index + 1}.${MIME_EXTENSION[file.type] ?? 'bin'}`,
					{ type: file.type },
				)
			: file,
	);
};

/** Allowlisted files on a drop. Names are kept. */
export const dropUploadFiles = (data: UploadTransfer | null): readonly File[] =>
	acceptUploadFiles(transferFiles(data));

/** `true` while the drag carries files, so the textarea can take the drop. */
export const dragCarriesFiles = (
	types: ArrayLike<string> | undefined,
): boolean => Array.from(types ?? []).includes('Files');
