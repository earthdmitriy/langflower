import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { langflowerWsConfig } from '@langflower/shared/langflower.js';
import { Subscription } from 'rxjs';
import type { Observable } from 'rxjs';
import type {
	WsBridgeError,
	WsBridgeStatus,
} from '@langflower/websocket-bridge';
import type { LangflowerBridge } from './langflower-bridge.types.js';

const REDACTED = '[REDACTED]';

type LogDirection = 'inbound' | 'outbound';

type BridgeEventLogRecord = {
	readonly schemaVersion: 1;
	readonly timestamp: string;
	readonly kind:
		| 'server-started'
		| 'server-closing'
		| 'connection'
		| 'disconnection'
		| 'status'
		| 'error'
		| 'frame';
	readonly direction?: LogDirection;
	readonly scope?: 'broadcast' | 'client';
	readonly clientId?: string;
	readonly type?: string;
	readonly payload?: unknown;
	readonly status?: WsBridgeStatus;
	readonly error?: {
		readonly code: string;
		readonly message: string;
		readonly cause?: unknown;
	};
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSecretKey = (key: string): boolean => {
	const normalized = key.toLowerCase();
	return (
		normalized.includes('apikey') ||
		normalized.includes('authorization') ||
		normalized.includes('cookie') ||
		normalized.includes('token') ||
		normalized.includes('password') ||
		normalized.includes('secret') ||
		normalized.includes('credential')
	);
};

const sanitize = (
	value: unknown,
	seen: WeakSet<object> = new WeakSet(),
): unknown => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}

	if (typeof value === 'bigint') {
		return `${value}n`;
	}

	if (typeof value === 'undefined') {
		return '[undefined]';
	}

	if (typeof value === 'symbol' || typeof value === 'function') {
		return `[${typeof value}]`;
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
		};
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === 'object') {
		if (seen.has(value)) {
			return '[circular]';
		}
		seen.add(value);
	}

	if (Array.isArray(value)) {
		return value.map((entry) => sanitize(entry, seen));
	}

	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				isSecretKey(key) ? REDACTED : sanitize(entry, seen),
			]),
		);
	}

	return String(value);
};

const toSafeTimestamp = (date: Date): string =>
	date.toISOString().replaceAll(':', '-').replaceAll('.', '-');

const asObservable = (value: unknown): Observable<unknown> | undefined =>
	isRecord(value) && typeof value.subscribe === 'function'
		? (value as unknown as Observable<unknown>)
		: undefined;

const asInboundEvent = (value: unknown): InboundBridgeEvent | undefined =>
	isRecord(value) && typeof value.clientId === 'string' && 'payload' in value
		? { clientId: value.clientId, payload: value.payload }
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

	const write = (
		record: Omit<BridgeEventLogRecord, 'schemaVersion' | 'timestamp'>,
	): void => {
		if (!enabled || !acceptingWrites || closed) {
			return;
		}

		const line = `${JSON.stringify(
			sanitize({
				schemaVersion: 1,
				timestamp: new Date().toISOString(),
				...record,
			} satisfies BridgeEventLogRecord),
		)}\n`;

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
					write({
						kind: 'frame',
						direction: 'inbound',
						clientId: event.clientId,
						type,
						payload: event.payload,
					});
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
				write({
					kind: 'frame',
					direction: 'outbound',
					scope: 'broadcast',
					type,
					payload,
				});
			}),
		);
	}

	subscriptions.add(
		bridge.status$.subscribe((status) => {
			write({ kind: 'status', status });
		}),
	);
	subscriptions.add(
		bridge.errors$.subscribe((error: WsBridgeError) => {
			write({
				kind: 'error',
				error: {
					code: error.code,
					message: error.message,
					...('cause' in error ? { cause: error.cause } : {}),
				},
			});
		}),
	);
	subscriptions.add(
		bridge.connections$.subscribe((client) => {
			write({ kind: 'connection', clientId: client.id });
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
						write({
							kind: 'frame',
							direction: 'outbound',
							scope: 'client',
							clientId: client.id,
							type,
							payload,
						});
					}),
				);
			}

			clientSubscriptions.add(
				client.disconnected$.subscribe(() => {
					write({ kind: 'disconnection', clientId: client.id });
					clientSubscriptions.unsubscribe();
				}),
			);
		}),
	);

	write({ kind: 'server-started' });

	return {
		filePath,
		setEnabled: (nextEnabled) => {
			enabled = nextEnabled;
		},
		writeServerClosing: () => {
			write({ kind: 'server-closing' });
			closed = true;
		},
		flush: async () => {
			await writeQueue;
		},
	};
};
