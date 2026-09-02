/**
 * Shared display formatting for port values in the work log and the
 * inspector's cached outputs — strings pass through unchanged (they are
 * already the readable content), objects/arrays pretty-print as JSON,
 * everything else stringifies.
 *
 * Combine error tuples from `combineStatefulObservables` use `false` for
 * "no error in that source" and may nest; those unwrap to leaf messages
 * instead of a JSON dump of `[false, {}, …]`.
 */

const isCombineErrorTuple = (value: unknown): value is readonly unknown[] => {
	if (!Array.isArray(value) || value.length === 0) {
		return false;
	}

	return value.every(
		(entry) =>
			entry === false ||
			typeof entry === 'string' ||
			entry instanceof Error ||
			isCombineErrorTuple(entry) ||
			(typeof entry === 'object' &&
				entry !== null &&
				!Array.isArray(entry) &&
				Object.keys(entry).length === 0),
	);
};

const unwrapPortError = (value: unknown): unknown => {
	if (!Array.isArray(value)) {
		return value;
	}

	const nested = value.filter(Boolean).map(unwrapPortError);

	if (nested.length === 0) {
		return value;
	}

	if (nested.length === 1) {
		return nested[0];
	}

	return nested;
};

const leafErrorMessage = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}

	if (value instanceof Error) {
		return value.message.length > 0 ? value.message : String(value);
	}

	if (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.keys(value).length === 0
	) {
		return 'Error';
	}

	return String(value);
};

const formatCombineError = (value: unknown): string => {
	const unwrapped = unwrapPortError(value);

	if (Array.isArray(unwrapped)) {
		return unwrapped
			.map((leaf) =>
				isCombineErrorTuple(leaf)
					? formatCombineError(leaf)
					: leafErrorMessage(leaf),
			)
			.filter((text) => text.length > 0)
			.join('\n');
	}

	return leafErrorMessage(unwrapped);
};

export const formatPortValue = (value: unknown): string => {
	if (typeof value === 'string') {
		return value;
	}

	if (value === null || value === undefined) {
		return String(value);
	}

	if (value instanceof Error) {
		return leafErrorMessage(value);
	}

	if (isCombineErrorTuple(value)) {
		return formatCombineError(value);
	}

	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	return String(value);
};
