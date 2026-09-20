import type { Observable, Subject } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';
import type {
	WsBridgeClientApi,
	WsBridgeClientIncoming,
	WsBridgeClientOutboundKey,
	WsBridgeClientOutgoing,
	WsBridgeConnectedClientApi,
	WsBridgeServerApi,
	WsBridgeServerIncoming,
	WsBridgeServerOutgoing,
} from './bridge-types.js';
import {
	pingWsConfig,
	type PingWsConfig,
	type PingPayload,
	type PongPayload,
} from './testing/sample-ping-ws-config.js';
import { assertTypeEqual, type ExpectEqual } from './testing/expect-type.js';

type PingClient = WsBridgeClientApi<PingWsConfig>;
type PingServer = WsBridgeServerApi<PingWsConfig>;
type PingConnectedClient = WsBridgeConnectedClientApi<PingWsConfig>;

assertTypeEqual<
	ExpectEqual<WsBridgeClientOutboundKey<PingWsConfig>, 'ping.sent'>
>();

assertTypeEqual<ExpectEqual<PingClient['ping.sent'], Subject<PingPayload>>>();

assertTypeEqual<
	ExpectEqual<PingClient['pong.received'], Observable<PongPayload>>
>();

assertTypeEqual<
	ExpectEqual<
		PingServer['ping.sent'],
		Observable<{
			readonly clientId: string;
			readonly payload: PingPayload;
		}>
	>
>();

assertTypeEqual<
	ExpectEqual<PingServer['pong.received'], Subject<PongPayload>>
>();

assertTypeEqual<
	ExpectEqual<PingConnectedClient['pong.received'], Subject<PongPayload>>
>();

describe('bridge-types compile-time contracts', () => {
	it('infers client outgoing as Subject and incoming as Observable', () => {
		expectTypeOf<PingClient['ping.sent']>().toExtend<
			Subject<PingPayload>
		>();
		expectTypeOf<PingClient['pong.received']>().toExtend<
			Observable<PongPayload>
		>();
	});

	it('infers server directions opposite to client', () => {
		expectTypeOf<PingServer['ping.sent']>().toExtend<
			Observable<{
				readonly clientId: string;
				readonly payload: PingPayload;
			}>
		>();
		expectTypeOf<PingServer['pong.received']>().toExtend<
			Subject<PongPayload>
		>();
	});

	it('infers per-client handle as server outgoing only', () => {
		expectTypeOf<PingConnectedClient['pong.received']>().toExtend<
			Subject<PongPayload>
		>();
		expectTypeOf<PingConnectedClient>().toHaveProperty('pong.received');
	});

	it('maps config sections to typed subject/observable maps', () => {
		expectTypeOf<WsBridgeClientOutgoing<PingWsConfig>>().toMatchTypeOf<{
			readonly 'ping.sent': Subject<PingPayload>;
		}>();

		expectTypeOf<WsBridgeClientIncoming<PingWsConfig>>().toMatchTypeOf<{
			readonly 'pong.received': Observable<PongPayload>;
		}>();

		expectTypeOf<WsBridgeServerIncoming<PingWsConfig>>().toMatchTypeOf<{
			readonly 'ping.sent': Observable<{
				readonly clientId: string;
				readonly payload: PingPayload;
			}>;
		}>();

		expectTypeOf<WsBridgeServerOutgoing<PingWsConfig>>().toMatchTypeOf<{
			readonly 'pong.received': Subject<PongPayload>;
		}>();
	});

	it('sample config satisfies WsBridgeConfig', () => {
		expectTypeOf(pingWsConfig.fromClientToServer).toHaveProperty(
			'ping.sent',
		);
		expectTypeOf(pingWsConfig.fromServerToClient).toHaveProperty(
			'pong.received',
		);
	});
});
