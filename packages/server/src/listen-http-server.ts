import type http from 'node:http';

/**
 * Bind `httpServer` and reject with a clear message when the port is taken
 * (instead of hanging on a listen without an `error` handler).
 */
export const listenHttpServer = (
	httpServer: http.Server,
	port: number,
	host = '127.0.0.1',
): Promise<void> =>
	new Promise((resolve, reject) => {
		const onError = (error: NodeJS.ErrnoException): void => {
			if (error.code === 'EADDRINUSE') {
				reject(new Error(`порт занят: ${host}:${String(port)}`));
				return;
			}

			reject(error);
		};

		httpServer.once('error', onError);
		httpServer.listen(port, host, () => {
			httpServer.off('error', onError);
			resolve();
		});
	});
