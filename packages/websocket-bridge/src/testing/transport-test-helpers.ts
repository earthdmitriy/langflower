import { WebSocketServer } from 'ws';

export async function getEphemeralPort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const wss = new WebSocketServer({ port: 0 }, () => {
			const address = wss.address();

			if (address === null || typeof address === 'string') {
				wss.close(() => {
					reject(new Error('Failed to resolve ephemeral port'));
				});
				return;
			}

			const port = address.port;

			wss.close(() => {
				resolve(port);
			});
		});

		wss.on('error', reject);
	});
}

export function waitForBridgeStatus(
	status$: {
		subscribe: (fn: (value: string) => void) => { unsubscribe: () => void };
	},
	expected: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			subscription.unsubscribe();
			reject(new Error(`Timed out waiting for status: ${expected}`));
		}, 5_000);

		const subscription = status$.subscribe((status) => {
			if (status === expected) {
				clearTimeout(timeout);
				subscription.unsubscribe();
				resolve();
			}
		});
	});
}
