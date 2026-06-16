/**
 * Author-time tool allowlist filter.
 *
 * - `enabledToolIds === undefined` → all registrations pass
 * - `enabledToolIds === []` → none pass
 * - otherwise → only ids in the allowlist pass
 */
export const filterEnabledRegistrations = <T>(
	registrations: readonly T[],
	enabledToolIds: readonly string[] | undefined,
	idOf: (registration: T) => string,
): readonly T[] => {
	if (enabledToolIds === undefined) {
		return registrations;
	}

	if (enabledToolIds.length === 0) {
		return [];
	}

	const allowed = new Set(enabledToolIds);

	return registrations.filter((registration) =>
		allowed.has(idOf(registration)),
	);
};
