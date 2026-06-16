import type { WsBridgeConfig, WsBridgeEvent } from './bridge-types.js';
import type { WsBridgeMessageSection } from './bridge-subjects.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const isWsBridgeEvent = (value: unknown): value is WsBridgeEvent => {
	if (!isRecord(value)) {
		return false;
	}

	return typeof value['type'] === 'string' && 'payload' in value;
};

const isKnownWsBridgeEventType = (
	config: WsBridgeConfig,
	type: string,
	section: WsBridgeMessageSection,
): boolean => type in config[section];

export const parseWsBridgeEvent = (
	config: WsBridgeConfig,
	value: unknown,
	section: WsBridgeMessageSection,
): WsBridgeEvent | null => {
	if (!isWsBridgeEvent(value)) {
		return null;
	}

	if (!isKnownWsBridgeEventType(config, value.type, section)) {
		return null;
	}

	return value;
};
