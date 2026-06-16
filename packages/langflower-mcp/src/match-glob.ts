/**
 * Simple `*` segment globs for bus event names (e.g. `workflow.*`, `runner.*.requested`).
 * `*` matches any run of characters except when used as a full segment pattern —
 * here `*` means "any substring" (including dots).
 */
export const matchGlob = (pattern: string, value: string): boolean => {
	if (pattern === '*') {
		return true;
	}

	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*');

	return new RegExp(`^${escaped}$`).test(value);
};

export const matchAnyGlob = (
	patterns: readonly string[],
	value: string,
): boolean => patterns.some((pattern) => matchGlob(pattern, value));
