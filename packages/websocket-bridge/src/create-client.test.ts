import { describe, expect, it } from 'vitest';
import { defaultWsBridgeCodec } from './bridge-codec.js';
import { pingWsConfig } from './testing/sample-ping-ws-config.js';
import { createClient } from './create-client.js';
import { createServer } from './create-server.js';

describe('createClient', () => {
	it('creates a bridge client api object', () => {
		const client = createClient(pingWsConfig, {
			url: 'ws://127.0.0.1:59999/ws',
		});

		expect(client).toHaveProperty('ping.sent');
		expect(client).toHaveProperty('pong.received');
		expect(client).toHaveProperty('errors$');
		expect(client).toHaveProperty('status$');
		expect(typeof client.close).toBe('function');

		client.close();
	});

	it('throws on Node when url and transport.port/path are omitted', () => {
		expect(() => createClient(pingWsConfig)).toThrow(/options.url/);
	});

	it('builds a Node url from config.transport without a kernel default', () => {
		const client = createClient({
			...pingWsConfig,
			transport: { path: '/bridge', port: 59998 },
		});

		expect(client).toHaveProperty('ping.sent');
		client.close();
	});
});

describe('createServer', () => {
	it('creates a bridge server api object', () => {
		const server = createServer(pingWsConfig, { port: 0 });

		expect(server).toHaveProperty('ping.sent');
		expect(server).toHaveProperty('pong.received');
		expect(server).toHaveProperty('connections$');
		expect(server).toHaveProperty('errors$');
		expect(typeof server.close).toBe('function');

		server.close();
	});
});

describe('defaultWsBridgeCodec', () => {
	it('round-trips bridge events as JSON', () => {
		const event = {
			type: 'ping.sent',
			payload: { nonce: 'abc' },
		};

		expect(
			defaultWsBridgeCodec.decode(
				defaultWsBridgeCodec.encode(event, 'out'),
			),
		).toEqual(event);
	});
});
