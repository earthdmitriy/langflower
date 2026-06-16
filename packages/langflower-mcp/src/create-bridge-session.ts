import type {
	ExecutionFeedSnapshotPayload,
	RunnerSnapshotPayload,
} from '@langflower/shared/langflower.js';
import { langflowerWsConfig } from '@langflower/shared/langflower.js';
import {
	waitSessionReady,
	type LangflowerWsClient,
} from '@langflower/shared/langflower-ws-waits';
import type { WsBridgeStatus } from '@langflower/websocket-bridge';
import type { RuntimeRunnerEvent } from './runtime-event-types.js';
import { createClient } from '@langflower/websocket-bridge/create-client';
import {
	defer,
	EMPTY,
	filter,
	firstValueFrom,
	from,
	map,
	merge,
	of,
	Subject,
	take,
	timeout,
	type Subscription,
} from 'rxjs';
import {
	appendEventLogFrame,
	applyFeedSnapshot,
	applyRunInterrupted,
	applyRunStarted,
	applyRunnerSnapshot,
	buildExecutionFeedTail,
	createExecutionFeedTailState,
	type ExecutionFeedTail,
	type ExecutionFeedTailState,
} from './execution-feed-tail.js';
import { OBSERVE_EVENT_KEYS } from './mcp-exposure-policy.js';
import { observeEvent$ } from './ws-client-access.js';

const ENSURE_READY_TIMEOUT_MS = 15_000;

/** Clears local appends / sets running — not feed body frames. */
const FEED_RUN_STARTED_EVENTS = [
	'runner.started',
	'runner.startNode.started',
	'runner.resume.started',
] as const;

/**
 * Bus events whose payloads are `RuntimeRunnerEvent` frames that also land in
 * `executionFeed.snapshot` / `RuntimeRunner.eventLog`.
 */
const FEED_EVENT_LOG_BUS_EVENTS = [
	'runner.output-emitted',
	'runner.input-received',
	'runner.done',
] as const;

export type BridgeSession = {
	readonly client: LangflowerWsClient;
	readonly wsUrl: string;
	readonly ensureReady: () => Promise<void>;
	readonly getCachedEvent: (event: string) => unknown;
	readonly getEventSeq: (event: string) => number;
	readonly waitForEventSeq: (
		event: string,
		minSeqExclusive: number,
		timeoutMs: number,
	) => Promise<unknown>;
	readonly getLiveFeedTail: (limit: number) => ExecutionFeedTail;
	readonly close: () => void;
};

export const resolveWsUrl = (options?: {
	readonly wsUrl?: string;
	readonly port?: number;
}): string => {
	if (options?.wsUrl !== undefined && options.wsUrl.length > 0) {
		return options.wsUrl;
	}

	const fromEnv = process.env['LANGFLOWER_WS_URL'];
	if (fromEnv !== undefined && fromEnv.length > 0) {
		return fromEnv;
	}

	const port = options?.port ?? langflowerWsConfig.transport?.port ?? 4010;
	const wsPath = langflowerWsConfig.transport?.path ?? '/ws';

	return `ws://127.0.0.1:${String(port)}${wsPath}`;
};

const readStatus = async (
	client: LangflowerWsClient,
): Promise<WsBridgeStatus> => {
	try {
		return await firstValueFrom(client.status$.pipe(take(1)));
	} catch {
		// Completed/disconnected BehaviorSubject → EmptyError; treat as down.
		return 'disconnected';
	}
};

export const createBridgeSession = (options?: {
	readonly wsUrl?: string;
	readonly port?: number;
}): BridgeSession => {
	const wsUrl = resolveWsUrl(options);
	let client: LangflowerWsClient | undefined;
	let cache = new Map<string, unknown>();
	let eventSeq = new Map<string, number>();
	let feedState: ExecutionFeedTailState = createExecutionFeedTailState();
	let subs: Subscription[] = [];
	let readyInFlight: Promise<void> | undefined;
	/** Fires when an observe-key cache seq advances (wait_event mode=next). */
	const seqAdvanced$ = new Subject<{
		readonly event: string;
		readonly seq: number;
		readonly value: unknown;
	}>();

	const bumpCache = (event: string, value: unknown): void => {
		cache.set(event, value);
		const seq = (eventSeq.get(event) ?? 0) + 1;
		eventSeq.set(event, seq);
		seqAdvanced$.next({ event, seq, value });
	};

	const detachClient = (): void => {
		for (const sub of subs) {
			sub.unsubscribe();
		}
		subs = [];
		cache = new Map();
		eventSeq = new Map();
		feedState = createExecutionFeedTailState();
		if (client !== undefined) {
			client.close();
			client = undefined;
		}
		readyInFlight = undefined;
	};

	const attachClient = (): LangflowerWsClient => {
		detachClient();
		const next = createClient(langflowerWsConfig, { url: wsUrl });
		client = next;

		for (const event of OBSERVE_EVENT_KEYS) {
			subs.push(
				observeEvent$(next, event).subscribe((value) => {
					bumpCache(event, value);

					if (event === 'executionFeed.snapshot') {
						feedState = applyFeedSnapshot(
							feedState,
							value as ExecutionFeedSnapshotPayload | null,
						);
						return;
					}

					if (event === 'runner.snapshot') {
						feedState = applyRunnerSnapshot(
							feedState,
							value as RunnerSnapshotPayload,
						);
						return;
					}

					if (
						(FEED_RUN_STARTED_EVENTS as readonly string[]).includes(
							event,
						) &&
						typeof value === 'string'
					) {
						feedState = applyRunStarted(feedState, value);
						return;
					}

					if (event === 'runner.interrupted') {
						feedState = applyRunInterrupted(feedState);
						return;
					}

					if (
						(
							FEED_EVENT_LOG_BUS_EVENTS as readonly string[]
						).includes(event)
					) {
						feedState = appendEventLogFrame(
							feedState,
							value as RuntimeRunnerEvent,
						);
					}
				}),
			);
		}

		return next;
	};

	const waitUntilSessionReady = async (
		active: LangflowerWsClient,
	): Promise<void> => {
		// Cache covers reconnect where `session.ready` already fired once.
		if (cache.has('session.ready')) {
			await firstValueFrom(
				active.status$.pipe(
					filter((status) => status === 'connected'),
					take(1),
					timeout({ first: ENSURE_READY_TIMEOUT_MS }),
				),
			);
			return;
		}

		await firstValueFrom(
			from(waitSessionReady(active)).pipe(
				timeout({ first: ENSURE_READY_TIMEOUT_MS }),
			),
		);
	};

	const ensureReady = async (): Promise<void> => {
		if (
			client !== undefined &&
			cache.has('session.ready') &&
			(await readStatus(client)) === 'connected'
		) {
			return;
		}

		readyInFlight ??= (async () => {
			try {
				const active = attachClient();
				await waitUntilSessionReady(active);
			} catch (error: unknown) {
				detachClient();
				const message =
					error instanceof Error ? error.message : String(error);
				throw new Error(
					`Failed to connect to Langflower at ${wsUrl}. Start the server (langflower start / npm run dev) first. (${message})`,
				);
			} finally {
				readyInFlight = undefined;
			}
		})();

		return readyInFlight;
	};

	const getEventSeq = (event: string): number => eventSeq.get(event) ?? 0;

	const waitForEventSeq = async (
		event: string,
		minSeqExclusive: number,
		timeoutMs: number,
	): Promise<unknown> => {
		try {
			// Fold: already-past seq OR next bumpCache for this key — no poll.
			return await firstValueFrom(
				merge(
					defer(() =>
						getEventSeq(event) > minSeqExclusive
							? of(cache.get(event))
							: EMPTY,
					),
					seqAdvanced$.pipe(
						filter(
							(frame) =>
								frame.event === event &&
								frame.seq > minSeqExclusive,
						),
						map((frame) => frame.value),
					),
				).pipe(take(1), timeout({ first: timeoutMs })),
			);
		} catch (error) {
			throw new Error(
				`wait_event(${event}, mode=next) timed out after ${String(timeoutMs)}ms — no new frame after seq=${String(minSeqExclusive)}. Prefer mode=latest or get_execution_feed_tail for telemetry that may already have finished.`,
				{ cause: error },
			);
		}
	};

	return {
		get client(): LangflowerWsClient {
			if (client === undefined) {
				throw new Error(
					'Langflower WS client is not connected. Call ensure_connected first.',
				);
			}
			return client;
		},
		wsUrl,
		ensureReady,
		getCachedEvent: (event) => cache.get(event),
		getEventSeq,
		waitForEventSeq,
		getLiveFeedTail: (limit) => buildExecutionFeedTail(feedState, limit),
		close: () => {
			detachClient();
		},
	};
};
