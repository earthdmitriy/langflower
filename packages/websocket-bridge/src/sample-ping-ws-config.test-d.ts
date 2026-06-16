import type { WsBridgeClientApi, WsBridgeServerApi } from './bridge-types.js';
import {
	pingWsConfig,
	type PingWsConfig,
} from './testing/sample-ping-ws-config.js';

declare const client: WsBridgeClientApi<PingWsConfig>;
declare const server: WsBridgeServerApi<PingWsConfig>;

client['ping.sent'].next({ nonce: 'abc' });
client['pong.received'].subscribe((_payload) => {
	// payload: PongPayload
});

server['pong.received'].next({ nonce: 'abc', serverTime: Date.now() });
server['ping.sent'].subscribe((_payload) => {
	// payload: PingPayload
});

// @ts-expect-error pong is server-only outgoing
client['pong.received'].next({ nonce: 'abc', serverTime: 0 });

// @ts-expect-error ping is client-only outgoing
server['ping.sent'].next({ nonce: 'abc' });

void pingWsConfig;
