/**
 * Minimal MCP JSON-RPC server over stdio (initialize + tools/list + tools/call).
 * Accepts Content-Length and newline JSON; replies in the peer's last framing.
 */

import type { McpToolDefinition } from './build-tool-catalog.js';
import type { BridgeSession } from './create-bridge-session.js';
import { handleToolCall } from './handle-tool-call.js';
import {
	createMcpStdioFrameParser,
	encodeMcpStdioFrame,
	type McpJsonMessage,
	type McpStdioFrameMode,
	type McpStdioParsedFrame,
} from './mcp-stdio-framing.js';

type JsonRpcRequest = {
	readonly jsonrpc: '2.0';
	readonly id?: number | string;
	readonly method: string;
	readonly params?: unknown;
};

const toolListPayload = (tools: readonly McpToolDefinition[]) => ({
	tools: tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
	})),
});

const asJsonRpcRequest = (message: McpJsonMessage): JsonRpcRequest | null => {
	if (typeof message['method'] !== 'string') {
		return null;
	}

	return {
		jsonrpc: '2.0',
		...(message['id'] !== undefined
			? { id: message['id'] as number | string }
			: {}),
		method: message['method'],
		...(message['params'] !== undefined
			? { params: message['params'] }
			: {}),
	};
};

const LIVENESS_METHODS = new Set([
	'initialize',
	'notifications/initialized',
	'tools/list',
	'ping',
]);

const readFrameMethod = (message: McpJsonMessage): string | undefined =>
	typeof message['method'] === 'string' ? message['method'] : undefined;

export const runMcpStdioServer = async (options: {
	readonly session: BridgeSession;
	readonly tools: readonly McpToolDefinition[];
	readonly stdin?: NodeJS.ReadableStream;
	readonly stdout?: NodeJS.WritableStream;
}): Promise<void> => {
	const stdin = options.stdin ?? process.stdin;
	const stdout = options.stdout ?? process.stdout;
	const toolsByName = new Map(
		options.tools.map((tool) => [tool.name, tool] as const),
	);

	// One complete frame per write — serialize so ping and tools/call cannot
	// interleave stdout bytes.
	let writeLock: Promise<void> = Promise.resolve();
	const writeMessage = (message: unknown, mode: McpStdioFrameMode): void => {
		const encoded = encodeMcpStdioFrame(message, mode);
		writeLock = writeLock
			.then(() => {
				stdout.write(encoded);
			})
			.catch((error: unknown) => {
				const text =
					error instanceof Error ? error.message : String(error);
				process.stderr.write(
					`[langflower-mcp] stdout write error: ${text}\n`,
				);
			});
	};

	const handle = async (frame: McpStdioParsedFrame): Promise<void> => {
		const replyMode = frame.mode;
		const request = asJsonRpcRequest(frame.message);
		if (request === null) {
			return;
		}

		const id = request.id;

		if (request.method === 'notifications/initialized') {
			return;
		}

		if (request.method === 'initialize') {
			writeMessage(
				{
					jsonrpc: '2.0',
					id,
					result: {
						protocolVersion: '2024-11-05',
						capabilities: { tools: {} },
						serverInfo: {
							name: 'langflower-mcp',
							version: '0.1.0',
						},
					},
				},
				replyMode,
			);
			return;
		}

		if (request.method === 'tools/list') {
			writeMessage(
				{
					jsonrpc: '2.0',
					id,
					result: toolListPayload(options.tools),
				},
				replyMode,
			);
			return;
		}

		if (request.method === 'tools/call') {
			const params =
				request.params !== null && typeof request.params === 'object'
					? (request.params as {
							name?: unknown;
							arguments?: unknown;
						})
					: {};
			const name = typeof params.name === 'string' ? params.name : '';
			const result = await handleToolCall(
				options.session,
				toolsByName,
				name,
				params.arguments ?? {},
			);

			writeMessage(
				{
					jsonrpc: '2.0',
					id,
					result: {
						content: [{ type: 'text', text: result.text }],
						isError: !result.ok,
					},
				},
				replyMode,
			);
			return;
		}

		if (request.method === 'ping') {
			writeMessage({ jsonrpc: '2.0', id, result: {} }, replyMode);
			return;
		}

		if (id !== undefined) {
			writeMessage(
				{
					jsonrpc: '2.0',
					id,
					error: {
						code: -32601,
						message: `Method not found: ${request.method}`,
					},
				},
				replyMode,
			);
		}
	};

	const reportHandlerError = (error: unknown): void => {
		const text = error instanceof Error ? error.message : String(error);
		process.stderr.write(`[langflower-mcp] handler error: ${text}\n`);
	};

	// Serialize tools/call (and other long waits). Liveness methods must
	// not sit behind an in-flight tool.
	let mutateQueue: Promise<void> = Promise.resolve();
	const dispatch = (frame: McpStdioParsedFrame): void => {
		const method = readFrameMethod(frame.message);
		if (method !== undefined && LIVENESS_METHODS.has(method)) {
			void handle(frame).catch(reportHandlerError);
			return;
		}

		mutateQueue = mutateQueue
			.then(() => handle(frame))
			.catch(reportHandlerError);
	};

	const parser = createMcpStdioFrameParser(dispatch);

	if (typeof stdin.resume === 'function') {
		stdin.resume();
	}

	stdin.on('data', (chunk: Buffer | string) => {
		parser.push(chunk);
	});

	await new Promise<void>((resolve) => {
		const done = (): void => resolve();
		stdin.once('end', done);
		stdin.once('close', done);
	});

	await mutateQueue;
	await writeLock;
	options.session.close();
};
