import { describe, expect, it } from 'vitest';
import { defaultWsBridgeCodec } from './bridge-codec.js';
import { diagramWsConfig } from './testing/sample-diagram-ws-config.js';
import { createClient } from './create-client.js';
import { createServer } from './create-server.js';

describe('createClient', () => {
	it('creates a bridge client api object', () => {
		const client = createClient(diagramWsConfig, {
			url: 'ws://127.0.0.1:59999/ws',
		});

		expect(client).toHaveProperty('edge.create.requested');
		expect(client).toHaveProperty('edge.create.command');
		expect(client).toHaveProperty('errors$');
		expect(client).toHaveProperty('status$');
		expect(typeof client.close).toBe('function');

		client.close();
	});
});

describe('createServer', () => {
	it('creates a bridge server api object', () => {
		const server = createServer(diagramWsConfig, { port: 0 });

		expect(server).toHaveProperty('edge.create.requested');
		expect(server).toHaveProperty('edge.create.command');
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
			defaultWsBridgeCodec.decode(defaultWsBridgeCodec.encode(event)),
		).toEqual(event);
	});
});
