import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeSession } from './create-bridge-session.js';
import { encodeMcpStdioFrame } from './mcp-stdio-framing.js';
import { runMcpStdioServer } from './mcp-stdio-server.js';

const releaseTool = vi.hoisted(() => ({
	resolve: undefined as
		((value: { ok: true; text: string }) => void) | undefined,
}));

vi.mock('./handle-tool-call.js', () => ({
	handleToolCall: () =>
		new Promise<{ ok: true; text: string }>((resolve) => {
			releaseTool.resolve = resolve;
		}),
}));

const parseNewlineReplies = (raw: string): readonly Record<string, unknown>[] =>
	raw
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('runMcpStdioServer dispatch', () => {
	afterEach(() => {
		releaseTool.resolve = undefined;
	});

	it('answers ping while a tools/call is still waiting', async () => {
		const stdin = new PassThrough();
		const stdout = new PassThrough();
		let stdoutText = '';
		stdout.on('data', (chunk: Buffer | string) => {
			stdoutText += chunk.toString('utf8');
		});

		const session: BridgeSession = {
			client: {} as BridgeSession['client'],
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
			close: vi.fn(),
		};

		const running = runMcpStdioServer({
			session,
			tools: [],
			stdin,
			stdout,
		});

		stdin.write(
			encodeMcpStdioFrame(
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: {
						name: 'wait_event',
						arguments: { event: 'runner.port' },
					},
				},
				'newline',
			),
		);
		stdin.write(
			encodeMcpStdioFrame(
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'ping',
				},
				'newline',
			),
		);

		await vi.waitFor(() => {
			const replies = parseNewlineReplies(stdoutText);
			expect(replies.some((reply) => reply['id'] === 2)).toBe(true);
		});

		expect(
			parseNewlineReplies(stdoutText).some((reply) => reply['id'] === 1),
		).toBe(false);

		releaseTool.resolve?.({ ok: true, text: 'tool-done' });

		await vi.waitFor(() => {
			const replies = parseNewlineReplies(stdoutText);
			expect(replies.some((reply) => reply['id'] === 1)).toBe(true);
		});

		stdin.end();
		await running;
		expect(session.close).toHaveBeenCalledOnce();
	});
});
