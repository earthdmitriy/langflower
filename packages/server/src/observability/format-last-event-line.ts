import {
	isPortErrorTelemetry,
	isPortValueTelemetry,
	type PortTelemetry,
	type ResponseDto,
} from '@langflower/runtime';
import type {
	RunnerAskUserAskPayload,
	RunnerPermissionAskPayload,
} from '@langflower/shared/langflower.js';

/** Max width of a `Last event:` stdout line (TTY and pipes). */
export const LAST_EVENT_LINE_CAP = 120;

/**
 * Live CLI progress facts. Natural `runner.done` is not included — the
 * settle line owns that outcome.
 */
export type CliProgressEvent =
	| { readonly type: 'port'; readonly event: PortTelemetry }
	| {
			readonly type: 'permissionAsk';
			readonly payload: RunnerPermissionAskPayload;
	  }
	| { readonly type: 'askUser'; readonly payload: RunnerAskUserAskPayload }
	| { readonly type: 'interrupted' };

type PortKind = 'pending' | 'value' | 'error';

const portKind = (response: ResponseDto<unknown>): PortKind | null => {
	if ('pending' in response) {
		return 'pending';
	}
	if ('value' in response) {
		return 'value';
	}
	if ('error' in response) {
		return 'error';
	}
	return null;
};

const capLine = (text: string): string =>
	text.length <= LAST_EVENT_LINE_CAP
		? text
		: `${text.slice(0, LAST_EVENT_LINE_CAP - 1)}…`;

const firstNonEmptyLine = (text: string): string => {
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return '';
};

const formatPreview = (value: unknown): string => {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return firstNonEmptyLine(value);
	}
	if (value instanceof Error) {
		return firstNonEmptyLine(
			value.message.length > 0 ? value.message : String(value),
		);
	}
	if (typeof value === 'object') {
		return 'JSON';
	}
	return String(value);
};

const formatPortLine = (
	event: PortTelemetry,
	nodeName: string,
): string | null => {
	const kind = portKind(event[3]);
	if (kind === null) {
		return null;
	}
	const prefix = `Last event: ${nodeName} · ${event[2]} · ${kind}`;
	if (kind === 'pending') {
		return capLine(prefix);
	}
	const preview = isPortValueTelemetry(event)
		? formatPreview(event[3].value)
		: isPortErrorTelemetry(event)
			? formatPreview(event[3].error)
			: '';
	if (preview.length === 0) {
		return capLine(prefix);
	}
	return capLine(`${prefix} · ${preview}`);
};

/** Human `Last event:` line, or `null` when the fact should not print. */
export const formatLastEventLine = (
	event: CliProgressEvent,
	nodeName: (nodeId: string) => string = (id) => id,
): string | null => {
	switch (event.type) {
		case 'port':
			return formatPortLine(
				event.event,
				nodeName(String(event.event[1])),
			);
		case 'permissionAsk':
			return capLine(
				`Last event: waiting · permission.ask · ${event.payload.toolId}`,
			);
		case 'askUser': {
			const name = nodeName(event.payload.nodeId);
			return capLine(`Last event: waiting · ask_user · ${name}`);
		}
		case 'interrupted':
			return 'Last event: stopped';
	}
};

/**
 * Throttle key: same port+kind (or same HITL ask) can update at most ~4 Hz.
 * Kind changes (pending → value) always produce a new identity.
 */
export const lastEventIdentity = (event: CliProgressEvent): string => {
	switch (event.type) {
		case 'port': {
			const kind = portKind(event.event[3]);
			const nodeId = String(event.event[1]);
			const portId = event.event[2];
			return `port:${nodeId}:${portId}:${kind ?? 'inactive'}`;
		}
		case 'permissionAsk':
			return `permissionAsk:${event.payload.askId}`;
		case 'askUser':
			return `askUser:${event.payload.askId}`;
		case 'interrupted':
			return 'interrupted';
	}
};
