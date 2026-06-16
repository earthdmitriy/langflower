import { BRIDGE_TOOL_META } from './generated/bridge-tool-meta.js';
import { resolveWaitEvent } from './intent-wait-map.js';
import { listActionIntents } from './list-action-intents.js';
import { OBSERVE_EVENT_KEYS } from './mcp-exposure-policy.js';
import { sanitizeToolName } from './sanitize-tool-name.js';

export type McpToolDefinition = {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
	readonly kind: 'action' | 'curated';
	readonly intent?: string;
	readonly waitEvent?: string | null;
};

const CURATED_TOOLS: readonly McpToolDefinition[] = [
	{
		name: 'ensure_connected',
		description:
			'Connect to the running Langflower WS bridge and wait for session.ready. Requires langflower start (default ws://127.0.0.1:4010/ws).',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
		},
		kind: 'curated',
	},
	{
		name: 'wait_session_ready',
		description:
			'Wait until the WS client is connected and session.ready has been received.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
		},
		kind: 'curated',
	},
	{
		name: 'wait_event',
		description:
			'Read/wait for a server→client bus event. Default mode=latest returns the last cached frame (safe for telemetry). mode=next waits for a newer frame and times out if the stream already finished — avoid for runner.output-emitted after the fact; use get_execution_feed_tail instead.',
		inputSchema: {
			type: 'object',
			properties: {
				event: {
					type: 'string',
					enum: [...OBSERVE_EVENT_KEYS],
				},
				mode: {
					type: 'string',
					enum: ['latest', 'next'],
					description:
						'latest (default): cached frame or wait until first. next: wait for a frame after this call.',
				},
				timeoutMs: { type: 'number' },
			},
			required: ['event'],
			additionalProperties: false,
		},
		kind: 'curated',
	},
	{
		name: 'get_execution_feed_tail',
		description:
			'Return the last N events from executionFeed.snapshot plus live eventLog appends (output-emitted / input-received / done). Status from runner gate (snapshot / start / interrupt / done). Prefer this over wait_event(runner.output-emitted).',
		inputSchema: {
			type: 'object',
			properties: {
				limit: { type: 'number', minimum: 1 },
			},
			additionalProperties: false,
		},
		kind: 'curated',
	},
];

export const buildToolCatalog = (): readonly McpToolDefinition[] => {
	const actions = listActionIntents().map((intent): McpToolDefinition => {
		const meta = BRIDGE_TOOL_META[intent as keyof typeof BRIDGE_TOOL_META];
		const waitEvent = resolveWaitEvent(intent);
		const waitNote =
			waitEvent === null
				? ' No automatic wait (fire-and-forget).'
				: ` Waits for \`${waitEvent}\` after emit.`;

		return {
			name: sanitizeToolName(intent),
			description: `${meta?.description ?? intent}.${waitNote}`,
			inputSchema: {
				type: 'object',
				properties: {
					payload: meta?.inputSchema ?? {
						type: 'object',
						additionalProperties: true,
					},
					timeoutMs: { type: 'number' },
				},
				required: ['payload'],
				additionalProperties: false,
			},
			kind: 'action',
			intent,
			waitEvent,
		};
	});

	return [...CURATED_TOOLS, ...actions];
};

/**
 * Fail if any allowlisted action intent lacks codegen meta (missing schema/description).
 */
export const assertToolMetaCoverage = (): void => {
	const missing = listActionIntents().filter(
		(intent) =>
			!Object.prototype.hasOwnProperty.call(BRIDGE_TOOL_META, intent),
	);

	if (missing.length > 0) {
		throw new Error(
			`BRIDGE_TOOL_META missing allowlisted intents: ${missing.join(', ')}. Run npm run codegen -w @langflower/mcp`,
		);
	}
};
