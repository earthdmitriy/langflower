import type { Observable, Subject } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';
import type {
	WsBridgeAnyEventType,
	WsBridgeAnyPayload,
	WsBridgeClientApi,
	WsBridgeClientIncoming,
	WsBridgeClientOutboundKey,
	WsBridgeClientOutgoing,
	WsBridgeConnectedClientApi,
	WsBridgeInboundObservables,
	WsBridgeOutboundSubjects,
	WsBridgeServerApi,
	WsBridgeServerIncoming,
	WsBridgeServerOutgoing,
} from './bridge-types.js';
import {
	diagramWsConfig,
	type DiagramWsConfig,
	type EdgeConnectionPayload,
	type EdgeCreateCommandPayload,
	type SessionReadyPayload,
} from './testing/sample-diagram-ws-config.js';
import {
	pingWsConfig,
	type PingWsConfig,
	type PingPayload,
	type PongPayload,
} from './testing/sample-ping-ws-config.js';
import { assertTypeEqual, type ExpectEqual } from './testing/expect-type.js';

type DiagramClient = WsBridgeClientApi<DiagramWsConfig>;
type DiagramServer = WsBridgeServerApi<DiagramWsConfig>;
type DiagramConnectedClient = WsBridgeConnectedClientApi<DiagramWsConfig>;
type PingClient = WsBridgeClientApi<PingWsConfig>;
type PingServer = WsBridgeServerApi<PingWsConfig>;

assertTypeEqual<
	ExpectEqual<
		WsBridgeAnyEventType<PingWsConfig>,
		'ping.sent' | 'pong.received'
	>
>();

assertTypeEqual<
	ExpectEqual<WsBridgeAnyPayload<PingWsConfig, 'ping.sent'>, PingPayload>
>();

assertTypeEqual<
	ExpectEqual<WsBridgeAnyPayload<PingWsConfig, 'pong.received'>, PongPayload>
>();

assertTypeEqual<
	ExpectEqual<
		WsBridgeClientOutboundKey<DiagramWsConfig>,
		'edge.create.requested'
	>
>();

assertTypeEqual<
	ExpectEqual<
		WsBridgeOutboundSubjects<
			DiagramWsConfig['fromClientToServer']
		>['edge.create.requested'],
		Subject<EdgeConnectionPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		WsBridgeInboundObservables<
			DiagramWsConfig['fromServerToClient']
		>['edge.create.command'],
		Observable<EdgeCreateCommandPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramClient['edge.create.requested'],
		Subject<EdgeConnectionPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramClient['edge.create.command'],
		Observable<EdgeCreateCommandPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramServer['edge.create.requested'],
		Observable<{
			readonly clientId: string;
			readonly payload: EdgeConnectionPayload;
		}>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramServer['edge.create.command'],
		Subject<EdgeCreateCommandPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramConnectedClient['edge.create.command'],
		Subject<EdgeCreateCommandPayload>
	>
>();

assertTypeEqual<
	ExpectEqual<
		DiagramConnectedClient['session.ready'],
		Subject<SessionReadyPayload>
	>
>();

describe('bridge-types compile-time contracts', () => {
	it('infers client outgoing as Subject and incoming as Observable', () => {
		expectTypeOf<DiagramClient['edge.create.requested']>().toExtend<
			Subject<EdgeConnectionPayload>
		>();
		expectTypeOf<DiagramClient['edge.create.command']>().toExtend<
			Observable<EdgeCreateCommandPayload>
		>();
	});

	it('infers server directions opposite to client', () => {
		expectTypeOf<DiagramServer['edge.create.requested']>().toExtend<
			Observable<{
				readonly clientId: string;
				readonly payload: EdgeConnectionPayload;
			}>
		>();
		expectTypeOf<DiagramServer['edge.create.command']>().toExtend<
			Subject<EdgeCreateCommandPayload>
		>();
	});

	it('infers per-client handle as server outgoing only', () => {
		expectTypeOf<DiagramConnectedClient['edge.create.command']>().toExtend<
			Subject<EdgeCreateCommandPayload>
		>();
		expectTypeOf<DiagramConnectedClient>().toHaveProperty('session.ready');
	});

	it('maps config sections to typed subject/observable maps', () => {
		expectTypeOf<WsBridgeClientOutgoing<DiagramWsConfig>>().toMatchTypeOf<{
			readonly 'edge.create.requested': Subject<EdgeConnectionPayload>;
		}>();

		expectTypeOf<WsBridgeClientIncoming<DiagramWsConfig>>().toMatchTypeOf<{
			readonly 'edge.create.command': Observable<EdgeCreateCommandPayload>;
			readonly 'session.ready': Observable<SessionReadyPayload>;
		}>();

		expectTypeOf<WsBridgeServerIncoming<DiagramWsConfig>>().toMatchTypeOf<{
			readonly 'edge.create.requested': Observable<EdgeConnectionPayload>;
		}>();

		expectTypeOf<WsBridgeServerOutgoing<DiagramWsConfig>>().toMatchTypeOf<{
			readonly 'edge.create.command': Subject<EdgeCreateCommandPayload>;
			readonly 'session.ready': Subject<SessionReadyPayload>;
		}>();
	});

	it('sample config satisfies WsBridgeConfig', () => {
		expectTypeOf(diagramWsConfig.fromClientToServer).toHaveProperty(
			'edge.create.requested',
		);
		expectTypeOf(diagramWsConfig.fromServerToClient).toHaveProperty(
			'edge.create.command',
		);
	});

	it('infers minimal ping config directions', () => {
		expectTypeOf<PingClient['ping.sent']>().toExtend<
			Subject<PingPayload>
		>();
		expectTypeOf<PingClient['pong.received']>().toExtend<
			Observable<PongPayload>
		>();
		expectTypeOf<PingServer['ping.sent']>().toExtend<
			Observable<{
				readonly clientId: string;
				readonly payload: PingPayload;
			}>
		>();
		expectTypeOf<PingServer['pong.received']>().toExtend<
			Subject<PongPayload>
		>();
		expectTypeOf(pingWsConfig.fromClientToServer).toHaveProperty(
			'ping.sent',
		);
	});
});
