/** File ref carried beside a completed tool line. Bytes stay off the feed. */
export type ToolCallFoldFile = {
	readonly fileId: string;
	readonly name: string;
	readonly mimeType: string;
};

/** Fold-local shape for one serial `→` / `←` toolLog pair. */
export type ToolCallFoldValue = {
	readonly name: string;
	readonly args: string;
	readonly result?: string;
	readonly files?: readonly ToolCallFoldFile[];
};

const REQUEST_PREFIX = '→ ';
const RESPONSE_PREFIX = '← ';

export const parseToolRequestLine = (
	value: unknown,
): { readonly name: string; readonly args: string } | undefined => {
	if (typeof value !== 'string' || !value.startsWith(REQUEST_PREFIX)) {
		return undefined;
	}

	const rest = value.slice(REQUEST_PREFIX.length);
	const open = rest.indexOf('(');
	if (open <= 0) {
		return undefined;
	}

	const name = rest.slice(0, open).trim();
	if (name.length === 0) {
		return undefined;
	}

	const afterOpen = rest.slice(open + 1);
	const args = afterOpen.endsWith(')') ? afterOpen.slice(0, -1) : afterOpen;
	return { name, args };
};

export const parseToolResponseLine = (
	value: unknown,
): { readonly name: string; readonly result: string } | undefined => {
	if (typeof value !== 'string' || !value.startsWith(RESPONSE_PREFIX)) {
		return undefined;
	}

	const rest = value.slice(RESPONSE_PREFIX.length);
	const colon = rest.indexOf(': ');
	if (colon <= 0) {
		return undefined;
	}

	const name = rest.slice(0, colon).trim();
	if (name.length === 0) {
		return undefined;
	}

	return { name, result: rest.slice(colon + 2) };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const readStagedToolFile = (value: unknown): ToolCallFoldFile | undefined => {
	if (!isRecord(value)) {
		return undefined;
	}

	const { fileId, name, mimeType } = value;
	if (
		typeof fileId !== 'string' ||
		fileId.length === 0 ||
		typeof name !== 'string' ||
		name.length === 0 ||
		typeof mimeType !== 'string' ||
		mimeType.length === 0
	) {
		return undefined;
	}

	return { fileId, name, mimeType };
};

const readStagedToolFiles = (value: unknown): readonly ToolCallFoldFile[] =>
	Array.isArray(value)
		? value.flatMap((entry) => readStagedToolFile(entry) ?? [])
		: [];

/**
 * A `←` line, or the same line on `{ text, files }` when the completed
 * fact carried staged uploads. The files are not recovered from the text.
 */
export const readToolResponseFrame = (
	value: unknown,
):
	| {
			readonly name: string;
			readonly result: string;
			readonly files?: readonly ToolCallFoldFile[];
	  }
	| undefined => {
	if (isRecord(value) && typeof value['text'] === 'string') {
		const parsed = parseToolResponseLine(value['text']);
		if (parsed === undefined) {
			return undefined;
		}

		const files = readStagedToolFiles(value['files']);
		return files.length === 0 ? parsed : { ...parsed, files };
	}

	return parseToolResponseLine(value);
};

export const isToolCallFoldValue = (
	value: unknown,
): value is ToolCallFoldValue => {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	if (!('name' in value) || !('args' in value)) {
		return false;
	}

	if (typeof value.name !== 'string' || typeof value.args !== 'string') {
		return false;
	}

	if (
		'result' in value &&
		value.result !== undefined &&
		typeof value.result !== 'string'
	) {
		return false;
	}

	if ('files' in value && value.files !== undefined) {
		return (
			Array.isArray(value.files) &&
			value.files.every(
				(entry) => readStagedToolFile(entry) !== undefined,
			)
		);
	}

	return true;
};

export const isUnmatchedToolCall = (
	value: unknown,
): value is ToolCallFoldValue =>
	isToolCallFoldValue(value) && !('result' in value);
