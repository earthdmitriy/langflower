import type { Subject } from 'rxjs';
import type { WsBridgeClientApi, WsBridgeServerApi } from './bridge-types.js';
import { type PingWsConfig } from './testing/sample-ping-ws-config.js';

declare const client: WsBridgeClientApi<PingWsConfig>;
declare const server: WsBridgeServerApi<PingWsConfig>;

// client -> server only
client['ping.sent'].next({
	nonce: 'abc',
});

// server -> client only
client['pong.received'].subscribe((_payload) => {
	// payload: PongPayload
});

// @ts-expect-error server-only outgoing message is not on client outgoing side
client['pong.received'].next({
	nonce: 'abc',
	serverTime: 1,
});

client['ping.sent'].next(
	// @ts-expect-error invalid payload shape for ping.sent
	{ edgeId: 'edge-1' },
);

// server -> client broadcast
server['pong.received'].next({
	nonce: 'abc',
	serverTime: 1,
});

// @ts-expect-error client-only message is not server outgoing
server['ping.sent'].next({
	nonce: 'abc',
});

server.injectInbound('ping.sent', {
	nonce: 'abc',
});

// @ts-expect-error unknown message key
const _unknownClientChannel: Subject<unknown> = client['unknown.message'];
