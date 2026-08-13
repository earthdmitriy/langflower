import type { LlmRecoveryNotice } from '@langflower/node-sdk/llm';

const formatDuration = (ms: number): string => {
	const totalSec = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSec / 60);
	const seconds = totalSec % 60;
	if (minutes === 0) {
		return `${seconds}s`;
	}

	return `${minutes}m ${seconds}s`;
};

const reasonLabel = (reason: LlmRecoveryNotice['reason']): string => {
	switch (reason) {
		case 'dead-loop':
			return 'dead loop';
		case 'rate-limit':
			return 'rate limit';
		case 'provider-unavailable':
			return 'provider error';
		case 'network':
			return 'network error';
		case 'idle':
		default:
			return 'idle stream';
	}
};

/** First line only — older recovery rows in a visit (no ticking wait). */
export const formatAutokickRetryHeadline = (
	notice: LlmRecoveryNotice,
): string =>
	`Retrying ${reasonLabel(notice.reason)} · retry ${notice.attempt ?? 1}`;

/**
 * Two-line autokick retry banner for the **latest** recovery row in a visit.
 * `nowMs` should come from `WorkflowExecutionService.livenessNowMs` — do not
 * add a second clock.
 */
export const formatAutokickRetryBanner = (
	notice: LlmRecoveryNotice,
	nowMs: number,
): string => {
	const line1 = formatAutokickRetryHeadline(notice);
	const lastPart =
		notice.lastAttemptAt === undefined
			? 'first wait'
			: `Last retry ${formatDuration(nowMs - notice.lastAttemptAt)} ago`;
	const remaining =
		notice.nextAttemptAt === undefined ? 0 : notice.nextAttemptAt - nowMs;
	if (remaining <= 0) {
		return `${line1}\n${lastPart}`;
	}

	return `${line1}\n${lastPart} · next in ${formatDuration(remaining)}`;
};
