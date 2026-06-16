import type { WsBridgeServerInboundEvent } from '@langflower/websocket-bridge';

export const isInboundEvent = <TPayload>(
	value: unknown,
): value is WsBridgeServerInboundEvent<TPayload> =>
	typeof value === 'object' &&
	value !== null &&
	'clientId' in value &&
	'payload' in value;
