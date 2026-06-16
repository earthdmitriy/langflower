import { createServer } from '@langflower/server/create-server';
import type { TerminalExecutionProgressStatus } from '@langflower/shared/langflower.js';
import type http from 'node:http';

export type TestServerUrls = {
	readonly httpBaseUrl: string;
	readonly wsUrl: string;
};

export type TestServerHandle = TestServerUrls & {
	readonly server: http.Server;
};

export const startTestServer = async (options: {
	readonly projectDir: string;
	readonly onRunSettled?: (status: TerminalExecutionProgressStatus) => void;
}): Promise<TestServerHandle> => {
	const server = await createServer({
		projectDir: options.projectDir,
		port: 0,
		...(options.onRunSettled !== undefined
			? { onRunSettled: options.onRunSettled }
			: {}),
	});

	const address = server.address();

	if (address === null || typeof address === 'string') {
		throw new Error('Failed to resolve test server listen port');
	}

	const httpBaseUrl = `http://127.0.0.1:${address.port}`;
	const wsUrl = `${httpBaseUrl.replace(/^http/, 'ws')}/ws`;

	return { httpBaseUrl, wsUrl, server };
};

export const stopTestServer = async (
	handle: TestServerHandle | undefined,
): Promise<void> => {
	if (handle === undefined) {
		return;
	}

	await new Promise<void>((resolve, reject) => {
		handle.server.close((error) => {
			if (error !== undefined) {
				reject(error);
				return;
			}

			resolve();
		});
	});
};
