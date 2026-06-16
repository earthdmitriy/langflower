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

export const runMcpStdioServer = async (options: {
	readonly session: BridgeSession;
	readonly tools: readonly McpToolDefinition[];
}): Promise<void> => {
	const toolsByName = new Map(
		options.tools.map((tool) => [tool.name, tool] as const),
	);

	// Cursor host speaks newline JSON; stay on newline until a peer proves CL.
	let replyMode: McpStdioFrameMode = 'newline';

	const writeMessage = (message: unknown): void => {
		process.stdout.write(encodeMcpStdioFrame(message, replyMode));
	};

	const handle = async (frame: McpStdioParsedFrame): Promise<void> => {
		replyMode = frame.mode;
		const request = asJsonRpcRequest(frame.message);
		if (request === null) {
			return;
		}

		const id = request.id;

		if (request.method === 'notifications/initialized') {
			return;
		}

		if (request.method === 'initialize') {
			writeMessage({
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
			});
			return;
		}

		if (request.method === 'tools/list') {
			writeMessage({
				jsonrpc: '2.0',
				id,
				result: toolListPayload(options.tools),
			});
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

			writeMessage({
				jsonrpc: '2.0',
				id,
				result: {
					content: [{ type: 'text', text: result.text }],
					isError: !result.ok,
				},
			});
			return;
		}

		if (request.method === 'ping') {
			writeMessage({ jsonrpc: '2.0', id, result: {} });
			return;
		}

		if (id !== undefined) {
			writeMessage({
				jsonrpc: '2.0',
				id,
				error: {
					code: -32601,
					message: `Method not found: ${request.method}`,
				},
			});
		}
	};

	// Serialize handlers so overlapping tools/call awaits cannot interleave
	// stdout frames.
	let queue: Promise<void> = Promise.resolve();
	const enqueue = (frame: McpStdioParsedFrame): void => {
		queue = queue
			.then(() => handle(frame))
			.catch((error: unknown) => {
				const text =
					error instanceof Error ? error.message : String(error);
				process.stderr.write(
					`[langflower-mcp] handler error: ${text}\n`,
				);
			});
	};

	const parser = createMcpStdioFrameParser(enqueue);

	if (typeof process.stdin.resume === 'function') {
		process.stdin.resume();
	}

	process.stdin.on('data', (chunk: Buffer | string) => {
		parser.push(chunk);
	});

	await new Promise<void>((resolve) => {
		const done = (): void => resolve();
		process.stdin.once('end', done);
		process.stdin.once('close', done);
	});

	await queue;
	options.session.close();
};
