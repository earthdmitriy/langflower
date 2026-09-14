/** Fold-local shape for one serial `→` / `←` toolLog pair. */
export type ToolCallFoldValue = {
	readonly name: string;
	readonly args: string;
	readonly result?: string;
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

	return true;
};

export const isUnmatchedToolCall = (
	value: unknown,
): value is ToolCallFoldValue =>
	isToolCallFoldValue(value) && !('result' in value);
