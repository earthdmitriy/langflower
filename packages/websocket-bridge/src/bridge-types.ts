import type { Observable, Subject } from 'rxjs';

/** Message registry entry — payload type is carried by `message<T>()`. */
export type WsBridgeMessageDefinition<Payload> = {
	readonly payload?: Payload;
};

export type WsBridgeMessageConfig = Record<
	string,
	WsBridgeMessageDefinition<unknown>
>;

export type WsBridgeTransportConfig = {
	readonly path?: string;
	readonly port?: number;
};

export type WsBridgeEvent<Payload = unknown> = {
	readonly type: string;
	readonly payload: Payload;
};

/** Wire + log line: `[ts, transportDir, busType, payload]`. */
export type BridgeFrame = readonly [
	ts: string,
	transportDir: 'in' | 'out',
	busType: string,
	payload: unknown,
];

export type WsBridgeCodec = {
	encode(event: WsBridgeEvent, transportDir: 'in' | 'out'): string;
	decode(raw: string): WsBridgeEvent | null;
};

export type WsBridgeConfig<
	ClientToServer extends WsBridgeMessageConfig = WsBridgeMessageConfig,
	ServerToClient extends WsBridgeMessageConfig = WsBridgeMessageConfig,
> = {
	readonly fromClientToServer: ClientToServer;
	readonly fromServerToClient: ServerToClient;
	readonly transport?: WsBridgeTransportConfig;
	readonly codec?: WsBridgeCodec;
};

export type WsBridgeStatus = 'connecting' | 'connected' | 'disconnected';

export type WsBridgeError = {
	readonly code: string;
	readonly message: string;
	readonly cause?: unknown;
};

export type WsBridgeEventType<T extends WsBridgeMessageConfig> = Extract<
	keyof T,
	string
>;

export type WsBridgeAnyEventType<C extends WsBridgeConfig> =
	| WsBridgeEventType<C['fromClientToServer']>
	| WsBridgeEventType<C['fromServerToClient']>;

export type WsBridgePayload<
	T extends WsBridgeMessageConfig,
	K extends WsBridgeEventType<T>,
> = T[K] extends WsBridgeMessageDefinition<infer Payload> ? Payload : never;

export type WsBridgeClientOutboundKey<C extends WsBridgeConfig> =
	WsBridgeEventType<C['fromClientToServer']>;

export type WsBridgeClientInboundKey<C extends WsBridgeConfig> =
	WsBridgeEventType<C['fromServerToClient']>;

export type WsBridgeServerOutboundKey<C extends WsBridgeConfig> =
	WsBridgeEventType<C['fromServerToClient']>;

export type WsBridgeServerInboundKey<C extends WsBridgeConfig> =
	WsBridgeEventType<C['fromClientToServer']>;

export type WsBridgeClientOutboundPayload<
	C extends WsBridgeConfig,
	K extends WsBridgeClientOutboundKey<C>,
> = WsBridgePayload<C['fromClientToServer'], K>;

export type WsBridgeClientInboundPayload<
	C extends WsBridgeConfig,
	K extends WsBridgeClientInboundKey<C>,
> = WsBridgePayload<C['fromServerToClient'], K>;

export type WsBridgeServerOutboundPayload<
	C extends WsBridgeConfig,
	K extends WsBridgeServerOutboundKey<C>,
> = WsBridgePayload<C['fromServerToClient'], K>;

export type WsBridgeServerInboundPayload<
	C extends WsBridgeConfig,
	K extends WsBridgeServerInboundKey<C>,
> = WsBridgePayload<C['fromClientToServer'], K>;

export type WsBridgeOutboundSubjects<T extends WsBridgeMessageConfig> = {
	readonly [K in WsBridgeEventType<T>]: Subject<WsBridgePayload<T, K>>;
};

export type WsBridgeInboundObservables<T extends WsBridgeMessageConfig> = {
	readonly [K in WsBridgeEventType<T>]: Observable<WsBridgePayload<T, K>>;
};

export type WsBridgeAnyPayload<
	C extends WsBridgeConfig,
	K extends WsBridgeAnyEventType<C>,
> =
	K extends WsBridgeEventType<C['fromClientToServer']>
		? WsBridgePayload<C['fromClientToServer'], K>
		: K extends WsBridgeEventType<C['fromServerToClient']>
			? WsBridgePayload<C['fromServerToClient'], K>
			: never;

export type WsBridgeOutgoingChannel<Payload> = Subject<Payload>;

export type WsBridgeIncomingChannel<Payload> = Observable<Payload>;

/** Server-side inbound frame — includes originating client id for targeted replies. */
export type WsBridgeServerInboundEvent<Payload> = {
	readonly clientId: string;
	readonly payload: Payload;
};

export type WsBridgeServerIncomingChannel<Payload> = Observable<
	WsBridgeServerInboundEvent<Payload>
>;

export type WsBridgeClientOutgoing<C extends WsBridgeConfig> = {
	readonly [K in WsBridgeClientOutboundKey<C>]: WsBridgeOutgoingChannel<
		WsBridgeClientOutboundPayload<C, K>
	>;
};

export type WsBridgeClientIncoming<C extends WsBridgeConfig> = {
	readonly [K in WsBridgeClientInboundKey<C>]: WsBridgeIncomingChannel<
		WsBridgeClientInboundPayload<C, K>
	>;
};

export type WsBridgeServerOutgoing<C extends WsBridgeConfig> = {
	readonly [K in WsBridgeServerOutboundKey<C>]: WsBridgeOutgoingChannel<
		WsBridgeServerOutboundPayload<C, K>
	>;
};

export type WsBridgeServerIncoming<C extends WsBridgeConfig> = {
	readonly [K in WsBridgeServerInboundKey<C>]: WsBridgeServerIncomingChannel<
		WsBridgeServerInboundPayload<C, K>
	>;
};

export type WsBridgeConnectedClient<C extends WsBridgeConfig> = {
	readonly id: string;
	readonly connected$: Observable<boolean>;
	readonly disconnected$: Observable<void>;
	close(): void;
};

export type WsBridgeConnectedClientApi<C extends WsBridgeConfig> =
	WsBridgeConnectedClient<C> & WsBridgeServerOutgoing<C>;

export type WsBridgeClient<C extends WsBridgeConfig> = {
	readonly errors$: Observable<WsBridgeError>;
	readonly status$: Observable<WsBridgeStatus>;
	close(): void;
};

export type WsBridgeClientApi<C extends WsBridgeConfig> = WsBridgeClient<C> &
	WsBridgeClientOutgoing<C> &
	WsBridgeClientIncoming<C>;

export type WsBridgeServer<C extends WsBridgeConfig> = {
	readonly connections$: Observable<WsBridgeConnectedClientApi<C>>;
	readonly errors$: Observable<WsBridgeError>;
	readonly status$: Observable<WsBridgeStatus>;
	close(): void;
	/**
	 * Push a client-to-server event as if a socket sent it (in-process
	 * hosts). Inbound channels stay Observables — not Subjects.
	 */
	injectInbound<K extends WsBridgeServerInboundKey<C>>(
		type: K,
		payload: WsBridgeServerInboundPayload<C, K>,
		clientId?: string,
	): void;
};

export type WsBridgeServerApi<C extends WsBridgeConfig> = WsBridgeServer<C> &
	WsBridgeServerIncoming<C> &
	WsBridgeServerOutgoing<C>;

/** Type carrier for config entries — no casts in consumer config. */
export const message = <Payload>(): WsBridgeMessageDefinition<Payload> => ({});
