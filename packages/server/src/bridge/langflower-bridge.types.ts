import { createServer as createWsBridge } from '@langflower/websocket-bridge/create-server';
import { langflowerWsConfig } from '@langflower/shared/langflower.js';

export type LangflowerBridge = ReturnType<
	typeof createWsBridge<typeof langflowerWsConfig>
>;

export type LangflowerClient =
	LangflowerBridge['connections$'] extends import('rxjs').Observable<
		infer Client
	>
		? Client
		: never;
