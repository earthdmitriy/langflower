import type { BridgeFrame, WsBridgeCodec, WsBridgeEvent } from './bridge-types.js';

const isBridgeFrame = (value: unknown): value is BridgeFrame =>
	Array.isArray(value) &&
	value.length === 4 &&
	typeof value[0] === 'string' &&
	(value[1] === 'in' || value[1] === 'out') &&
	typeof value[2] === 'string';

export const encodeBridgeFrame = (
	transportDir: 'in' | 'out',
	busType: string,
	payload: unknown,
	ts = new Date().toISOString(),
): string =>
	JSON.stringify([ts, transportDir, busType, payload] satisfies BridgeFrame);

export const defaultWsBridgeCodec: WsBridgeCodec = {
	encode(event: WsBridgeEvent, transportDir: 'in' | 'out'): string {
		return encodeBridgeFrame(transportDir, event.type, event.payload);
	},
	decode(raw: string): WsBridgeEvent | null {
		try {
			const parsed: unknown = JSON.parse(raw);

			if (!isBridgeFrame(parsed)) {
				return null;
			}

			return {
				type: parsed[2],
				payload: parsed[3],
			};
		} catch {
			return null;
		}
	},
};
