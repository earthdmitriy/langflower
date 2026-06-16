import {
	waitBusEvent,
	waitSessionReady,
} from '@langflower/shared/langflower-ws-waits';
import type { McpToolDefinition } from './build-tool-catalog.js';
import type { BridgeSession } from './create-bridge-session.js';
import {
	resolveResumeFailedPredicate,
	resolveWaitPredicate,
} from './intent-wait-predicate.js';
import {
	OBSERVE_EVENT_KEYS,
	type ObserveEventKey,
} from './mcp-exposure-policy.js';
import { resolveWaitEventMode } from './wait-event-mode.js';
import { emitClientIntent, observeEvent$ } from './ws-client-access.js';

export type ToolCallResult = {
	readonly ok: boolean;
	readonly text: string;
};

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2);

const asObserveEventKey = (event: string): ObserveEventKey => {
	if (!(OBSERVE_EVENT_KEYS as readonly string[]).includes(event)) {
		throw new Error(`Unknown inbound bus event: ${event}`);
	}
	return event as ObserveEventKey;
};

const emitAction = async (
	session: BridgeSession,
	tool: McpToolDefinition,
	args: Readonly<Record<string, unknown>>,
): Promise<ToolCallResult> => {
	if (tool.intent === undefined) {
		return { ok: false, text: 'Action tool missing intent.' };
	}

	await session.ensureReady();

	const payload = args['payload'];
	const timeoutMs =
		typeof args['timeoutMs'] === 'number' ? args['timeoutMs'] : 30_000;
	const waitEvent = tool.waitEvent;

	const emit = (): ToolCallResult | null => {
		try {
			emitClientIntent(session.client, tool.intent!, payload);
			return null;
		} catch (error: unknown) {
			return {
				ok: false,
				text:
					error instanceof Error
						? error.message
						: `Unknown outbound intent: ${tool.intent}`,
			};
		}
	};

	if (waitEvent === null || waitEvent === undefined) {
		const failed = emit();
		if (failed !== null) {
			return failed;
		}
		return {
			ok: true,
			text: jsonText({
				emitted: tool.intent,
				payload,
				wait: null,
			}),
		};
	}

	const predicate = resolveWaitPredicate(tool.intent, payload);

	// Resume can fail on a unicast `runner.resume.failed` — race so agents
	// do not hang on the success-only wait until timeout.
	if (tool.intent === 'runner.resume.requested') {
		const failedPredicate = resolveResumeFailedPredicate(payload);
		const startedOutcome = waitBusEvent(
			observeEvent$(session.client, 'runner.resume.started'),
			{
				timeoutMs,
				...(predicate !== undefined ? { predicate } : {}),
			},
		).then((result) => ({
			outcome: 'started' as const,
			result,
		}));
		const failedOutcome = waitBusEvent(
			observeEvent$(session.client, 'runner.resume.failed'),
			{
				timeoutMs,
				...(failedPredicate !== undefined
					? { predicate: failedPredicate }
					: {}),
			},
		).then((result) => ({
			outcome: 'failed' as const,
			result,
		}));
		// Losing arm still times out — swallow so race does not leave an
		// unhandled rejection after the winner settles.
		void startedOutcome.catch(() => undefined);
		void failedOutcome.catch(() => undefined);
		const failedEmit = emit();
		if (failedEmit !== null) {
			return failedEmit;
		}
		const raced = await Promise.race([startedOutcome, failedOutcome]);
		if (raced.outcome === 'failed') {
			return {
				ok: false,
				text: jsonText({
					emitted: tool.intent,
					waitEvent: 'runner.resume.failed',
					result: raced.result,
				}),
			};
		}
		return {
			ok: true,
			text: jsonText({
				emitted: tool.intent,
				waitEvent: 'runner.resume.started',
				result: raced.result,
			}),
		};
	}

	const resultPromise = waitBusEvent(
		observeEvent$(session.client, asObserveEventKey(waitEvent)),
		{
			timeoutMs,
			...(predicate !== undefined ? { predicate } : {}),
		},
	);
	const failed = emit();
	if (failed !== null) {
		return failed;
	}
	const result = await resultPromise;

	return {
		ok: true,
		text: jsonText({
			emitted: tool.intent,
			waitEvent,
			result,
		}),
	};
};

const handleCurated = async (
	session: BridgeSession,
	toolName: string,
	args: Readonly<Record<string, unknown>>,
): Promise<ToolCallResult> => {
	switch (toolName) {
		case 'ensure_connected': {
			await session.ensureReady();
			return {
				ok: true,
				text: jsonText({
					wsUrl: session.wsUrl,
					status: 'ready',
				}),
			};
		}
		case 'wait_session_ready': {
			await session.ensureReady();
			await waitSessionReady(session.client);
			return { ok: true, text: jsonText({ status: 'ready' }) };
		}
		case 'wait_event': {
			await session.ensureReady();
			const event = args['event'];
			if (typeof event !== 'string') {
				return { ok: false, text: 'event must be a string' };
			}
			if (!(OBSERVE_EVENT_KEYS as readonly string[]).includes(event)) {
				return {
					ok: false,
					text: `event not in observe allowlist: ${event}`,
				};
			}

			const mode = resolveWaitEventMode(args);
			const timeoutMs =
				typeof args['timeoutMs'] === 'number'
					? args['timeoutMs']
					: mode === 'next'
						? 10_000
						: 15_000;

			if (mode === 'latest') {
				const cached = session.getCachedEvent(event);
				if (cached !== undefined) {
					return {
						ok: true,
						text: jsonText({
							event,
							mode,
							result: cached,
							fromCache: true,
							seq: session.getEventSeq(event),
						}),
					};
				}
			}

			const seqBefore = session.getEventSeq(event);
			const result = await session.waitForEventSeq(
				event,
				seqBefore,
				timeoutMs,
			);
			return {
				ok: true,
				text: jsonText({
					event,
					mode,
					result,
					fromCache: false,
					seq: session.getEventSeq(event),
				}),
			};
		}
		case 'get_execution_feed_tail': {
			await session.ensureReady();
			const limit =
				typeof args['limit'] === 'number' && args['limit'] > 0
					? Math.floor(args['limit'])
					: 20;

			return {
				ok: true,
				text: jsonText(session.getLiveFeedTail(limit)),
			};
		}
		default:
			return { ok: false, text: `Unknown curated tool: ${toolName}` };
	}
};

export const handleToolCall = async (
	session: BridgeSession,
	toolsByName: ReadonlyMap<string, McpToolDefinition>,
	name: string,
	rawArgs: unknown,
): Promise<ToolCallResult> => {
	const tool = toolsByName.get(name);

	if (tool === undefined) {
		return { ok: false, text: `Unknown tool: ${name}` };
	}

	const args: Readonly<Record<string, unknown>> =
		rawArgs !== null && typeof rawArgs === 'object'
			? (rawArgs as Record<string, unknown>)
			: {};

	try {
		if (tool.kind === 'action') {
			return await emitAction(session, tool, args);
		}

		return await handleCurated(session, tool.name, args);
	} catch (error) {
		return {
			ok: false,
			text: error instanceof Error ? error.message : String(error),
		};
	}
};
