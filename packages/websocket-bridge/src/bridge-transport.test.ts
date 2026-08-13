import { firstValueFrom } from 'rxjs';
import { filter, take, timeout } from 'rxjs/operators';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createClient } from './create-client.js';
import { createServer } from './create-server.js';
import type {
	WsBridgeClientApi,
	WsBridgeConnectedClientApi,
	WsBridgeServerApi,
} from './bridge-types.js';
import {
	getEphemeralPort,
	waitForBridgeStatus,
} from './testing/transport-test-helpers.js';
import {
	pingWsConfig,
	type PingWsConfig,
} from './testing/sample-ping-ws-config.js';

describe('ws bridge transport', () => {
	let port = 0;
	let server: WsBridgeServerApi<PingWsConfig>;
	let client: WsBridgeClientApi<PingWsConfig>;
	let connectedClient: WsBridgeConnectedClientApi<PingWsConfig>;

	beforeEach(async () => {
		port = await getEphemeralPort();
		server = createServer(pingWsConfig, {
			port,
			path: '/ws',
		});
		await waitForBridgeStatus(server.status$, 'connected');

		const connectedClientPromise = firstValueFrom(
			server.connections$.pipe(take(1), timeout(5_000)),
		);

		client = createClient(pingWsConfig, {
			url: `ws://127.0.0.1:${port}/ws`,
		});
		await waitForBridgeStatus(client.status$, 'connected');
		connectedClient = await connectedClientPromise;
	});

	afterEach(() => {
		client.close();
		server.close();
	});

	it('delivers client-to-server payloads to server inbound observable', async () => {
		const received = firstValueFrom(
			server['ping.sent'].pipe(
				filter((event) => event.payload.nonce === 'client-1'),
				take(1),
				timeout(5_000),
			),
		);

		client['ping.sent'].next({ nonce: 'client-1' });

		await expect(received).resolves.toEqual({
			clientId: expect.any(String),
			payload: { nonce: 'client-1' },
		});
	});

	it('routes message-specific observables only for their event type', async () => {
		const serverPing = firstValueFrom(
			server['ping.sent'].pipe(take(1), timeout(5_000)),
		);

		client['ping.sent'].next({ nonce: 'only-ping' });

		await expect(serverPing).resolves.toMatchObject({
			payload: { nonce: 'only-ping' },
		});
	});

	it('delivers server-to-client broadcast payloads to client inbound observable', async () => {
		const received = firstValueFrom(
			client['pong.received'].pipe(
				filter((payload) => payload.nonce === 'broadcast'),
				take(1),
				timeout(5_000),
			),
		);

		server['pong.received'].next({
			nonce: 'broadcast',
			serverTime: 42,
		});

		await expect(received).resolves.toEqual({
			nonce: 'broadcast',
			serverTime: 42,
		});
	});

	it('broadcasts server outgoing events to all connected clients', async () => {
		const secondClient = createClient(pingWsConfig, {
			url: `ws://127.0.0.1:${port}/ws`,
		});

		await waitForBridgeStatus(secondClient.status$, 'connected');

		const firstReceived = firstValueFrom(
			client['pong.received'].pipe(take(1), timeout(5_000)),
		);
		const secondReceived = firstValueFrom(
			secondClient['pong.received'].pipe(take(1), timeout(5_000)),
		);

		server['pong.received'].next({
			nonce: 'all',
			serverTime: 1,
		});

		await expect(firstReceived).resolves.toEqual({
			nonce: 'all',
			serverTime: 1,
		});
		await expect(secondReceived).resolves.toEqual({
			nonce: 'all',
			serverTime: 1,
		});

		secondClient.close();
	});

	it('sends targeted server-to-client events through connected client handle', async () => {
		const received = firstValueFrom(
			client['pong.received'].pipe(
				filter((payload) => payload.nonce === 'targeted'),
				take(1),
				timeout(5_000),
			),
		);

		connectedClient['pong.received'].next({
			nonce: 'targeted',
			serverTime: 99,
		});

		await expect(received).resolves.toEqual({
			nonce: 'targeted',
			serverTime: 99,
		});
	});

	it('emits disconnected$ when client socket closes', async () => {
		const disconnected = firstValueFrom(
			connectedClient.disconnected$.pipe(take(1), timeout(5_000)),
		);

		client.close();

		await expect(disconnected).resolves.toBeUndefined();
	});

	it('routes invalid JSON frames to errors$', async () => {
		const errorPromise = firstValueFrom(
			server.errors$.pipe(
				filter((error) => error.code === 'INVALID_FRAME'),
				take(1),
				timeout(5_000),
			),
		);

		const ws = await import('ws');
		const rawClient = new ws.default(`ws://127.0.0.1:${port}/ws`);

		await new Promise<void>((resolve) => {
			rawClient.on('open', () => {
				rawClient.send('not-json');
				resolve();
			});
		});

		await expect(errorPromise).resolves.toMatchObject({
			code: 'INVALID_FRAME',
		});

		rawClient.close();
	});

	it('routes unknown event types to errors$', async () => {
		const errorPromise = firstValueFrom(
			server.errors$.pipe(
				filter((error) => error.code === 'UNKNOWN_EVENT_TYPE'),
				take(1),
				timeout(5_000),
			),
		);

		const ws = await import('ws');
		const rawClient = new ws.default(`ws://127.0.0.1:${port}/ws`);

		await new Promise<void>((resolve) => {
			rawClient.on('open', () => {
				rawClient.send(
					JSON.stringify([
						new Date().toISOString(),
						'in',
						'unknown.event',
						{ ok: true },
					]),
				);
				resolve();
			});
		});

		await expect(errorPromise).resolves.toMatchObject({
			code: 'UNKNOWN_EVENT_TYPE',
		});

		rawClient.close();
	});
});
