import { message, type WsBridgeConfig } from '../bridge-types.js';

export type PingPayload = {
	readonly nonce: string;
};

export type PongPayload = {
	readonly nonce: string;
	readonly serverTime: number;
};

/** Minimal bidirectional config — ping from client, pong from server. */
export const pingWsConfig = {
	fromClientToServer: {
		'ping.sent': message<PingPayload>(),
	},
	fromServerToClient: {
		'pong.received': message<PongPayload>(),
	},
} as const satisfies WsBridgeConfig;

export type PingWsConfig = typeof pingWsConfig;
