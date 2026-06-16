import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { listenHttpServer } from './listen-http-server.js';

describe('listenHttpServer', () => {
	const servers: http.Server[] = [];

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(
				(server) =>
					new Promise<void>((resolve) => {
						server.close(() => {
							resolve();
						});
					}),
			),
		);
	});

	it('rejects with порт занят when the port is taken', async () => {
		const holder = http.createServer();
		servers.push(holder);
		await listenHttpServer(holder, 0, '127.0.0.1');
		const address = holder.address();
		expect(address).not.toBeNull();
		if (address === null || typeof address === 'string') {
			return;
		}

		const contender = http.createServer();
		servers.push(contender);
		await expect(
			listenHttpServer(contender, address.port, '127.0.0.1'),
		).rejects.toThrow(`порт занят: 127.0.0.1:${String(address.port)}`);
	});

	it('resolves when the port is free', async () => {
		const server = http.createServer();
		servers.push(server);
		await expect(
			listenHttpServer(server, 0, '127.0.0.1'),
		).resolves.toBeUndefined();
	});
});
