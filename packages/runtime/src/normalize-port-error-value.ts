/**
 * `combineStatefulObservables` maps source errors to a positional tuple where
 * `false` means "no error in that source". Nested combines deepen the tuple.
 * Telemetry / feed should show the leaf message(s), not the raw aggregate.
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
			// CtxError / message-shaped payloads on SO error-lane
			(typeof entry === 'object' &&
				entry !== null &&
				!Array.isArray(entry) &&
				typeof (entry as { message?: unknown }).message === 'string') ||
			// WS JSON turns Error into `{}`
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
		typeof (value as { message?: unknown }).message === 'string'
	) {
		const message = (value as { message: string }).message;
		return message.length > 0 ? message : 'Error';
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

/**
 * Normalize a StatefulObservable `.error` payload for runner telemetry.
 * Combine tuples → recursive truthy unwrap → human-readable message string.
 */
export const normalizePortErrorValue = (value: unknown): string => {
	if (isCombineErrorTuple(value) || Array.isArray(value)) {
		const unwrapped = unwrapPortError(value);

		if (Array.isArray(unwrapped)) {
			return unwrapped
				.map((leaf) =>
					isCombineErrorTuple(leaf) || Array.isArray(leaf)
						? normalizePortErrorValue(leaf)
						: leafErrorMessage(leaf),
				)
				.filter((text) => text.length > 0)
				.join('\n');
		}

		return leafErrorMessage(unwrapped);
	}

	return leafErrorMessage(value);
};
