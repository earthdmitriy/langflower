import {
	formatLastEventLine,
	lastEventIdentity,
	type CliProgressEvent,
} from './format-last-event-line.js';

/** Same port+kind streaming updates at most ~4 Hz. */
export const LAST_EVENT_THROTTLE_MS = 250;

export type LastEventReporterOptions = {
	readonly now?: () => number;
	readonly nodeName?: (nodeId: string) => string;
};

export type LastEventReporter = {
	readonly emit: (event: CliProgressEvent) => void;
	readonly reset: () => void;
};

/**
 * Format + throttle CLI last-event facts. The sink receives a ready
 * `Last event:` line — TTY vs pipe writing stays in the CLI.
 */
export const createLastEventReporter = (
	onLine: (line: string) => void,
	options: LastEventReporterOptions = {},
): LastEventReporter => {
	const now = options.now ?? (() => Date.now());
	const nodeName = options.nodeName ?? ((id) => id);
	let lastIdentity = '';
	let lastLine = '';
	let lastMs = 0;

	return {
		emit: (event) => {
			const line = formatLastEventLine(event, nodeName);
			if (line === null) {
				return;
			}
			const identity = lastEventIdentity(event);
			const timestamp = now();
			if (
				identity === lastIdentity &&
				timestamp - lastMs < LAST_EVENT_THROTTLE_MS
			) {
				return;
			}
			if (line === lastLine) {
				lastIdentity = identity;
				lastMs = timestamp;
				return;
			}
			lastIdentity = identity;
			lastLine = line;
			lastMs = timestamp;
			onLine(line);
		},
		reset: () => {
			lastIdentity = '';
			lastLine = '';
			lastMs = 0;
		},
	};
};
