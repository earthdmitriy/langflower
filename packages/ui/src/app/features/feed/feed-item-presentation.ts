import { isLlmRecoveryNotice } from '@langflower/node-sdk/llm';
import { formatPortValue } from '../../utils/format-port-value.js';
import type { PortStreamItem } from '../feed-folding/types.js';
import {
	formatAutokickRetryBanner,
	formatAutokickRetryHeadline,
} from './format-autokick-retry-banner.js';
import { formatFeedCollapsedPreview } from './format-feed-collapsed-preview.js';

export const collapsedSummary = (label: string, value: unknown): string =>
	`${label} — ${formatFeedCollapsedPreview(value)}`;

export const itemText = (item: PortStreamItem): string =>
	formatPortValue(item.value);

export const recoveryBanner = (
	item: PortStreamItem,
	nowMs: number,
	includeTimer: boolean,
): string => {
	if (
		isLlmRecoveryNotice(item.value) &&
		item.value.code === 'retry' &&
		item.value.nextAttemptAt !== undefined
	) {
		return includeTimer
			? formatAutokickRetryBanner(item.value, nowMs)
			: formatAutokickRetryHeadline(item.value);
	}

	return itemText(item);
};

export const presentationLabel = (item: PortStreamItem): string => {
	switch (item.meta.presentation) {
		case 'reasoning':
			return 'Reasoning';
		case 'progress':
			return 'PROGRESS';
		case 'draft':
			return 'Draft';
		case 'tool':
		case 'tool-request':
		case 'tool-response':
			return 'Tool';
		case 'shell':
			return 'Shell';
		case 'result':
			return 'Response';
		case 'recovery':
			return 'Recovery';
		case 'error':
			return 'Error';
		case 'permission-ask':
			return 'Permission';
		case 'permission-grant':
			return 'Permission allowed';
		case 'permission-deny':
			return 'Permission denied';
		case 'hitl-user':
			return 'User';
		case 'steering-pause':
			return 'Paused';
		case 'steering-resume':
			return 'Resumed';
		default:
			return 'Data';
	}
};
