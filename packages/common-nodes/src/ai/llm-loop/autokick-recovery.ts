export const autokickBackoffMs = (
	attempt: number,
	baseMs: number,
	maxMs: number,
): number => {
	const safeAttempt = Math.max(1, attempt);
	const delay = baseMs * 2 ** (safeAttempt - 1);
	return Math.min(delay, maxMs);
};

export const clampChatPenalty = (value: number): number =>
	Math.min(2, Math.max(-2, value));

export const autokickPenalties = (
	attempt: number,
	delta: { readonly frequency: number; readonly presence: number },
): { readonly frequency: number; readonly presence: number } => {
	const safeAttempt = Math.max(1, attempt);
	return {
		frequency: clampChatPenalty(delta.frequency * safeAttempt),
		presence: clampChatPenalty(delta.presence * safeAttempt),
	};
};

export const autokickKickUserTurn = (
	content: string,
): { readonly role: 'user'; readonly content: string } => ({
	role: 'user',
	content,
});
