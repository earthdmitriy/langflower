import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { langflowerWsConfig } from '@langflower/shared/langflower.js';
import { encodeBridgeFrame } from '@langflower/websocket-bridge/bridge-codec';
import { Subscription } from 'rxjs';
import type { Observable } from 'rxjs';
import type { LangflowerBridge } from './langflower-bridge.types.js';

export type BridgeEventLog = {
	readonly filePath: string;
	setEnabled(enabled: boolean): void;
	writeServerClosing(): void;
	flush(): Promise<void>;
};

export type AttachBridgeEventLogOptions = {
	readonly enabled?: boolean;
};

type InboundBridgeEvent = {
	readonly clientId: string;
	readonly payload: unknown;
};

const toSafeTimestamp = (date: Date): string =>
	date.toISOString().replaceAll(':', '-').replaceAll('.', '-');

const asObservable = (value: unknown): Observable<unknown> | undefined =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { subscribe?: unknown }).subscribe === 'function'
		? (value as Observable<unknown>)
		: undefined;

const asInboundEvent = (value: unknown): InboundBridgeEvent | undefined =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as { clientId?: unknown }).clientId === 'string' &&
	'payload' in value
		? {
				clientId: (value as InboundBridgeEvent).clientId,
				payload: (value as InboundBridgeEvent).payload,
			}
		: undefined;

const logPath = (projectDir: string): string =>
	path.join(
		projectDir,
		'.langflower',
		'logs',
		`${toSafeTimestamp(new Date())}-${process.pid}-${randomUUID()}.log`,
	);

export const attachBridgeEventLog = (
	bridge: LangflowerBridge,
	projectDir: string,
	subscriptions: Subscription,
	options: AttachBridgeEventLogOptions = {},
): BridgeEventLog => {
	const filePath = logPath(projectDir);
	let enabled = options.enabled !== false;
	let acceptingWrites = true;
	let closed = false;
	let reportedFailure = false;
	let directoryReady = false;
	let writeQueue: Promise<void> = Promise.resolve();

	const reportFailure = (error: unknown): void => {
		if (reportedFailure) {
			return;
		}
		reportedFailure = true;
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(
			`Langflower diagnostic logging disabled: ${message}\n`,
		);
	};

	const writeFrame = (
		transportDir: 'in' | 'out',
		busType: string,
		payload: unknown,
	): void => {
		if (!enabled || !acceptingWrites || closed) {
			return;
		}

		const line = `${encodeBridgeFrame(transportDir, busType, payload)}\n`;

		writeQueue = writeQueue.then(async () => {
			if (!enabled || !acceptingWrites) {
				return;
			}

			try {
				if (!directoryReady) {
					await fs.mkdir(path.dirname(filePath), { recursive: true });
					directoryReady = true;
				}
				await fs.appendFile(filePath, line, 'utf8');
			} catch (error) {
				acceptingWrites = false;
				reportFailure(error);
			}
		});
	};

	const bridgeChannels = bridge as unknown as Record<string, unknown>;
	const inboundKeys = Object.keys(langflowerWsConfig.fromClientToServer);
	const outboundKeys = Object.keys(langflowerWsConfig.fromServerToClient);

	for (const type of inboundKeys) {
		const channel = asObservable(bridgeChannels[type]);
		if (channel === undefined) {
			continue;
		}
		subscriptions.add(
			channel.subscribe((value) => {
				const event = asInboundEvent(value);
				if (event !== undefined) {
					writeFrame('in', type, event.payload);
				}
			}),
		);
	}

	for (const type of outboundKeys) {
		const channel = asObservable(bridgeChannels[type]);
		if (channel === undefined) {
			continue;
		}
		subscriptions.add(
			channel.subscribe((payload) => {
				writeFrame('out', type, payload);
			}),
		);
	}

	subscriptions.add(
		bridge.connections$.subscribe((client) => {
			const clientSubscriptions = new Subscription();
			subscriptions.add(clientSubscriptions);

			const clientChannels = client as unknown as Record<string, unknown>;
			for (const type of outboundKeys) {
				const channel = asObservable(clientChannels[type]);
				if (channel === undefined) {
					continue;
				}
				clientSubscriptions.add(
					channel.subscribe((payload) => {
						writeFrame('out', type, payload);
					}),
				);
			}

			clientSubscriptions.add(
				client.disconnected$.subscribe(() => {
					clientSubscriptions.unsubscribe();
				}),
			);
		}),
	);

	return {
		filePath,
		setEnabled: (nextEnabled) => {
			enabled = nextEnabled;
		},
		writeServerClosing: () => {
			closed = true;
		},
		flush: async () => {
			await writeQueue;
		},
	};
};
