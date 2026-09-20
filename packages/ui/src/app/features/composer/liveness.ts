/** Quiet after this many ms with no output-emitted for the node. */
export const QUIET_AFTER_MS = 10_000;

export const isQuietSince = (
	lastActivityMs: number | undefined,
	nowMs: number,
	quietAfterMs: number = QUIET_AFTER_MS,
): boolean =>
	lastActivityMs !== undefined && nowMs - lastActivityMs >= quietAfterMs;
