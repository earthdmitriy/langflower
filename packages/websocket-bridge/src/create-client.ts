import type { Subscription } from 'rxjs';
import { BehaviorSubject, Subject } from 'rxjs';
import NodeWebSocket from 'ws';
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
	WsBridgeClientApi,
	WsBridgeCodec,
	WsBridgeConfig,
	WsBridgeError,
	WsBridgeStatus,
} from './bridge-types.js';

export type CreateClientOptions = {
	readonly url?: string;
};

type WsBridgeSocket = {
	readonly readyState: number;
	send(data: string): void;
	close(): void;
	onOpen(callback: () => void): void;
	onMessage(callback: (data: string) => void): void;
	onClose(callback: () => void): void;
	onError(callback: (error: unknown) => void): void;
};

const OPEN = 1;

function connectSocket(url: string): WsBridgeSocket {
	if (typeof globalThis.WebSocket !== 'undefined') {
		const ws = new globalThis.WebSocket(url);

		return {
			get readyState() {
				return ws.readyState;
			},
			send: (data) => {
				ws.send(data);
			},
			close: () => {
				ws.close();
			},
			onOpen: (callback) => {
				ws.onopen = () => {
					callback();
				};
			},
			onMessage: (callback) => {
				ws.onmessage = (event) => {
					callback(String(event.data));
				};
			},
			onClose: (callback) => {
				ws.onclose = () => {
					callback();
				};
			},
			onError: (callback) => {
				ws.onerror = (event) => {
					callback(event);
				};
			},
		};
	}

	const ws = new NodeWebSocket(url);

	return {
		get readyState() {
			return ws.readyState;
		},
		send: (data) => {
			ws.send(data);
		},
		close: () => {
			ws.close();
		},
		onOpen: (callback) => {
			ws.on('open', callback);
		},
		onMessage: (callback) => {
			ws.on('message', (data) => {
				callback(String(data));
			});
		},
		onClose: (callback) => {
			ws.on('close', callback);
		},
		onError: (callback) => {
			ws.on('error', callback);
		},
	};
}

function resolveClientUrl(
	config: WsBridgeConfig,
	options: CreateClientOptions,
): string {
	if (options.url !== undefined) {
		return options.url;
	}

	const path = config.transport?.path ?? '/ws';

	if (typeof globalThis.window !== 'undefined') {
		const protocol =
			globalThis.window.location.protocol === 'https:' ? 'wss:' : 'ws:';

		return `${protocol}//${globalThis.window.location.host}${path}`;
	}

	const port = config.transport?.port ?? 4010;

	return `ws://127.0.0.1:${port}${path}`;
}

export function createClient<C extends WsBridgeConfig>(
	config: C,
	options: CreateClientOptions = {},
): WsBridgeClientApi<C> {
	const codec: WsBridgeCodec = config.codec ?? defaultWsBridgeCodec;
	const url = resolveClientUrl(config, options);

	const clientToServerKeys = readMessageKeys(config, 'fromClientToServer');
	const serverToClientKeys = readMessageKeys(config, 'fromServerToClient');

	const outgoingSubjects = createSubjectMap(clientToServerKeys);
	const inboundSubjects = createSubjectMap(serverToClientKeys);
	const inboundObservables = toObservables(inboundSubjects);

	const errorsSubject = new Subject<WsBridgeError>();
	const statusSubject = new BehaviorSubject<WsBridgeStatus>('connecting');

	const socket = connectSocket(url);

	const sendEvent = (event: { type: string; payload: unknown }): void => {
		if (socket.readyState !== OPEN) {
			errorsSubject.next({
				code: 'TRANSPORT_NOT_OPEN',
				message: 'Cannot send while WebSocket is not open',
			});
			return;
		}

		socket.send(codec.encode(event));
	};

	// Wire at construction so early `.next` is not silently dropped; sendEvent
	// still rejects until the socket is OPEN.
	const wireSubscriptions: Subscription[] = wireOutgoingSubjects(
		outgoingSubjects,
		sendEvent,
	);

	socket.onOpen(() => {
		statusSubject.next('connected');
	});

	socket.onMessage((raw) => {
		const frame = decodeInboundFrame(
			config,
			codec,
			raw,
			'fromServerToClient',
		);

		if ('error' in frame) {
			errorsSubject.next(frame.error);
			return;
		}

		routeInboundEvent(frame.event, inboundSubjects);
	});

	let tornDown = false;

	const tearDown = (closeSocket: boolean): void => {
		if (tornDown) {
			return;
		}

		tornDown = true;
		statusSubject.next('disconnected');

		for (const subscription of wireSubscriptions) {
			subscription.unsubscribe();
		}

		completeSubjects(outgoingSubjects);
		completeSubjects(inboundSubjects);
		errorsSubject.complete();
		statusSubject.complete();

		if (closeSocket) {
			socket.close();
		}
	};

	socket.onClose(() => {
		tearDown(false);
	});

	socket.onError((cause) => {
		errorsSubject.next({
			code: 'TRANSPORT_ERROR',
			message: 'WebSocket client error',
			cause,
		});
	});

	const core = {
		errors$: errorsSubject.asObservable(),
		status$: statusSubject.asObservable(),
		close(): void {
			tearDown(true);
		},
	};

	return Object.assign(
		core,
		outgoingSubjects,
		inboundObservables,
	) as WsBridgeClientApi<C>;
}
