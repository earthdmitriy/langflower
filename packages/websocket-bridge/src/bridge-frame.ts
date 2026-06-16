import type { WsBridgeCodec, WsBridgeError } from './bridge-types.js';
import { isWsBridgeEvent, parseWsBridgeEvent } from './bridge-guards.js';
import type { WsBridgeMessageSection } from './bridge-subjects.js';
import type { WsBridgeConfig } from './bridge-types.js';

function createWsBridgeError(
	code: string,
	message: string,
	cause?: unknown,
): WsBridgeError {
	return cause === undefined ? { code, message } : { code, message, cause };
}

export function decodeInboundFrame(
	config: WsBridgeConfig,
	codec: WsBridgeCodec,
	raw: string,
	section: WsBridgeMessageSection,
): { event: { type: string; payload: unknown } } | { error: WsBridgeError } {
	const decoded = codec.decode(raw);

	if (decoded === null) {
		return {
			error: createWsBridgeError(
				'INVALID_FRAME',
				'Frame is not valid bridge JSON envelope',
			),
		};
	}

	const event = parseWsBridgeEvent(config, decoded, section);

	if (event !== null) {
		return { event };
	}

	if (isWsBridgeEvent(decoded)) {
		return {
			error: createWsBridgeError(
				'UNKNOWN_EVENT_TYPE',
				`Unknown or disallowed event type: ${decoded.type}`,
			),
		};
	}

	return {
		error: createWsBridgeError(
			'INVALID_ENVELOPE',
			'Frame must be a { type, payload } object',
		),
	};
}
