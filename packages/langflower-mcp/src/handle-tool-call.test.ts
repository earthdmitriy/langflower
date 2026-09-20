import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import type { LangflowerWsClient } from '@langflower/shared/langflower-ws-waits';
import type { McpToolDefinition } from './build-tool-catalog.js';
import type { BridgeSession } from './create-bridge-session.js';
import { handleToolCall } from './handle-tool-call.js';

const loadTool: McpToolDefinition = {
	name: 'workflow_load_requested',
	description: 'Load a workflow.',
	inputSchema: { type: 'object' },
	kind: 'action',
	intent: 'workflow.load.requested',
	waitEvent: 'workflow.current.snapshot',
};

const createLoadHarness = () => {
	const loadFailed$ = new Subject<unknown>();
	const current$ = new Subject<unknown>();
	const loadRequested$ = new Subject<unknown>();
	const client = {
		'workflow.load.failed': loadFailed$,
		'workflow.current.snapshot': current$,
		'workflow.load.requested': loadRequested$,
	} as unknown as LangflowerWsClient;
	const session: BridgeSession = {
		client,
		wsUrl: 'ws://127.0.0.1:4010/ws',
		ensureReady: async () => undefined,
		getCachedEvent: () => undefined,
		getEventSeq: () => 0,
		waitForEventSeq: async () => undefined,
		getLiveFeedTail: () => ({
			total: 0,
			limit: 0,
			runId: null,
			status: null,
			events: [],
		}),
		close: () => undefined,
	};
	const toolsByName = new Map<string, McpToolDefinition>([
		[loadTool.name, loadTool],
	]);

	return {
		session,
		toolsByName,
		loadFailed$,
		current$,
		loadRequested$,
	};
};

describe('handleToolCall workflow.load', () => {
	it('returns on workflow.load.failed instead of hanging on unchanged current', async () => {
		const { session, toolsByName, loadFailed$, current$ } =
			createLoadHarness();

		const pending = handleToolCall(session, toolsByName, loadTool.name, {
			payload: { workflowId: 'missing' },
			timeoutMs: 400,
		});

		await Promise.resolve();
		current$.next({
			activeWorkflow: {
				workflowId: 'other',
				metadata: { name: 'Other' },
			},
			currentStatus: { status: 'pristine' },
		});
		loadFailed$.next({
			workflowId: 'missing',
			code: 'NOT_FOUND',
			message: 'Workflow not found',
		});

		const result = await pending;
		expect(result.ok).toBe(false);
		expect(result.text).toContain('workflow.load.failed');
		expect(result.text).not.toMatch(/timed out/i);
	});

	it('resolves a correlated current snapshot on successful load', async () => {
		const { session, toolsByName, current$ } = createLoadHarness();

		const pending = handleToolCall(session, toolsByName, loadTool.name, {
			payload: { workflowId: 'demo' },
			timeoutMs: 400,
		});

		await Promise.resolve();
		current$.next({
			activeWorkflow: {
				workflowId: 'demo',
				metadata: { name: 'Demo' },
			},
			currentStatus: { status: 'pristine' },
		});

		const result = await pending;
		expect(result.ok).toBe(true);
		expect(result.text).toContain('workflow.current.snapshot');
	});
});
