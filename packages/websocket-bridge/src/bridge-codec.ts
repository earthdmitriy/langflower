import type { WsBridgeCodec, WsBridgeEvent } from './bridge-types.js';

export const defaultWsBridgeCodec: WsBridgeCodec = {
	encode(event: WsBridgeEvent): string {
		return JSON.stringify(event);
	},
	decode(raw: string): WsBridgeEvent | null {
		try {
			const parsed: unknown = JSON.parse(raw);

			if (
				typeof parsed !== 'object' ||
				parsed === null ||
				Array.isArray(parsed)
			) {
				return null;
			}

			const record = parsed as Record<string, unknown>;

			if (typeof record['type'] !== 'string' || !('payload' in record)) {
				return null;
			}

			return {
				type: record['type'],
				payload: record['payload'],
			};
		} catch {
			return null;
		}
	},
};
