import { randomUUID } from 'node:crypto';
import type { Subscription } from 'rxjs';
import { BehaviorSubject, Subject } from 'rxjs';
import { WebSocketServer, type WebSocket } from 'ws';
import { defaultWsBridgeCodec } from './bridge-codec.js';
import { decodeInboundFrame } from './bridge-frame.js';
import {
	completeSubjects,
	createSubjectMap,
	readMessageKeys,
	routeInboundEvent,
	toObservables,
	wireOutgoingSubjects,
} from './bridge-subjects.js';
import type {
	WsBridgeCodec,
	WsBridgeConfig,
	WsBridgeConnectedClientApi,
	WsBridgeError,
	WsBridgeServerApi,
	WsBridgeStatus,
} from './bridge-types.js';

export type CreateServerOptions = {
	readonly host?: string;
	readonly port?: number;
	readonly path?: string;
	readonly httpServer?: import('node:http').Server;
};

type ConnectedClientRecord<C extends WsBridgeConfig> = {
	readonly id: string;
	readonly ws: WebSocket;
	readonly api: WsBridgeConnectedClientApi<C>;
	readonly outgoingSubjects: Record<string, Subject<unknown>>;
	readonly subscriptions: Subscription[];
	readonly disconnectedSubject: Subject<void>;
};

export function createServer<C extends WsBridgeConfig>(
	config: C,
	options: CreateServerOptions = {},
): WsBridgeServerApi<C> {
	const codec: WsBridgeCodec = config.codec ?? defaultWsBridgeCodec;
	const path = options.path ?? config.transport?.path ?? '/ws';
	const host = options.host ?? '127.0.0.1';
	const port = options.port ?? config.transport?.port ?? 0;

	const clientToServerKeys = readMessageKeys(config, 'fromClientToServer');
	const serverToClientKeys = readMessageKeys(config, 'fromServerToClient');

	const inboundSubjects = createSubjectMap(clientToServerKeys);
	const broadcastSubjects = createSubjectMap(serverToClientKeys);
	const inboundObservables = toObservables(inboundSubjects);

	const connectionsSubject = new Subject<WsBridgeConnectedClientApi<C>>();
	const errorsSubject = new Subject<WsBridgeError>();
	const statusSubject = new BehaviorSubject<WsBridgeStatus>('connecting');

	const clients = new Set<ConnectedClientRecord<C>>();
	const wireSubscriptions: Subscription[] = wireOutgoingSubjects(
		broadcastSubjects,
		(event) => {
			const raw = codec.encode(event);

			for (const client of clients) {
				if (client.ws.readyState === client.ws.OPEN) {
					client.ws.send(raw);
				}
			}
		},
	);

	const wss =
		options.httpServer !== undefined
			? new WebSocketServer({ server: options.httpServer, path })
			: new WebSocketServer({ host, port, path });

	if (options.httpServer !== undefined) {
		if (options.httpServer.listening) {
			statusSubject.next('connected');
		} else {
			options.httpServer.once('listening', () => {
				statusSubject.next('connected');
			});
		}
	}

	wss.on('listening', () => {
		if (options.httpServer === undefined) {
			statusSubject.next('connected');
		}
	});

	wss.on('error', (cause) => {
		errorsSubject.next({
			code: 'TRANSPORT_ERROR',
			message: 'WebSocket server error',
			cause,
		});
		statusSubject.next('disconnected');
	});

	wss.on('connection', (ws) => {
		const id = randomUUID();
		const outgoingSubjects = createSubjectMap(serverToClientKeys);
		const disconnectedSubject = new Subject<void>();
		const connectedSubject = new BehaviorSubject<boolean>(true);
		const subscriptions = wireOutgoingSubjects(
			outgoingSubjects,
			(event) => {
				if (ws.readyState !== ws.OPEN) {
					return;
				}

				ws.send(codec.encode(event));
			},
		);

		const closeClient = (): void => {
			if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
				ws.close();
			}
		};

		const api = Object.assign(
			{
				id,
				connected$: connectedSubject.asObservable(),
				disconnected$: disconnectedSubject.asObservable(),
				close: closeClient,
			},
			outgoingSubjects,
		) as WsBridgeConnectedClientApi<C>;

		const record: ConnectedClientRecord<C> = {
			id,
			ws,
			api,
			outgoingSubjects,
			subscriptions,
			disconnectedSubject,
		};

		clients.add(record);
		connectionsSubject.next(api);

		ws.on('message', (raw) => {
			const frame = decodeInboundFrame(
				config,
				codec,
				String(raw),
				'fromClientToServer',
			);

			if ('error' in frame) {
				errorsSubject.next(frame.error);
				return;
			}

			routeInboundEvent(frame.event, inboundSubjects, id);
		});

		ws.on('close', () => {
			connectedSubject.next(false);
			connectedSubject.complete();
			disconnectedSubject.next();
			disconnectedSubject.complete();
			clients.delete(record);

			for (const subscription of subscriptions) {
				subscription.unsubscribe();
			}

			completeSubjects(outgoingSubjects);
		});
	});

	const core = {
		connections$: connectionsSubject.asObservable(),
		errors$: errorsSubject.asObservable(),
		status$: statusSubject.asObservable(),
		close(): void {
			statusSubject.next('disconnected');

			for (const client of [...clients]) {
				client.ws.close();
			}

			for (const subscription of wireSubscriptions) {
				subscription.unsubscribe();
			}

			completeSubjects(broadcastSubjects);
			completeSubjects(inboundSubjects);
			connectionsSubject.complete();
			errorsSubject.complete();
			statusSubject.complete();

			wss.close();
		},
	};

	return Object.assign(
		core,
		inboundObservables,
		broadcastSubjects,
	) as WsBridgeServerApi<C>;
}
