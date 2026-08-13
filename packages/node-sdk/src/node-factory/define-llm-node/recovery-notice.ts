/**
 * Structured recovery notice on the LLM `recovery` inventory output.
 * Distinct from toolLog so the feed can show first-class recovery chrome and
 * open Steer only when {@link LlmRecoveryNotice.code} is `'suspended'`.
 */

export const RECOVERY_PORT_ID = 'recovery' as const;

export type LlmRecoveryNoticeCode = 'retry' | 'suspended';

export type LlmRecoveryRetryReason =
	'idle' | 'dead-loop' | 'rate-limit' | 'provider-unavailable' | 'network';

export type LlmRecoveryNotice = {
	readonly code: LlmRecoveryNoticeCode;
	readonly text: string;
	readonly attempt?: number;
	readonly reason?: LlmRecoveryRetryReason;
	readonly lastAttemptAt?: number;
	readonly nextAttemptAt?: number;
	readonly backoffMs?: number;
};

export const isLlmRecoveryNotice = (
	value: unknown,
): value is LlmRecoveryNotice => {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		(record['code'] === 'retry' || record['code'] === 'suspended') &&
		typeof record['text'] === 'string'
	);
};

export const isLlmRecoverySuspended = (value: unknown): boolean =>
	isLlmRecoveryNotice(value) && value.code === 'suspended';

export const recoveryNoticeText = (value: unknown): string => {
	if (isLlmRecoveryNotice(value)) {
		return value.text;
	}
	if (typeof value === 'string') {
		return value;
	}
	return '';
};

/** Port payload: `code` + `text` plus any additive timing fields. */
export const toLlmRecoveryPortValue = (
	notice: LlmRecoveryNotice,
): LlmRecoveryNotice => ({
	code: notice.code,
	text: notice.text,
	...(notice.attempt !== undefined ? { attempt: notice.attempt } : {}),
	...(notice.reason !== undefined ? { reason: notice.reason } : {}),
	...(notice.lastAttemptAt !== undefined
		? { lastAttemptAt: notice.lastAttemptAt }
		: {}),
	...(notice.nextAttemptAt !== undefined
		? { nextAttemptAt: notice.nextAttemptAt }
		: {}),
	...(notice.backoffMs !== undefined ? { backoffMs: notice.backoffMs } : {}),
});
