import type { PortTelemetry, RuntimeFeedRole } from '@langflower/runtime';

const FEED_ROLES = new Set<RuntimeFeedRole>([
	'none',
	'reasoning',
	'progress',
	'draft',
	'tool',
	'shell',
	'result',
	'recovery',
]);

export const frameFeedRole = (
	event: PortTelemetry,
): RuntimeFeedRole | undefined => {
	const role = event[6]?.role;
	return typeof role === 'string' && FEED_ROLES.has(role) ? role : undefined;
};

export const frameIsStreaming = (event: PortTelemetry): boolean =>
	event[6]?.streaming === true;

export const frameClosesPreviousVisit = (event: PortTelemetry): boolean =>
	event[6]?.closesPreviousVisit === true;
