/**
 * Minimal MCP JSON-RPC client over stdio (tools/list + tools/call only).
 * Avoids pulling `@modelcontextprotocol/sdk` into the monorepo until needed.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type {
	McpCallResult,
	McpClient,
	McpListedTool,
} from './mcp-client-types.js';
import { envWithShellComSpec } from './env-with-shell-com-spec.js';
import { createMcpStdioFrameParser } from './mcp-stdio-frame-parser.js';
import { requireMcpServerName } from './require-mcp-server-name.js';

export type {
	McpCallResult,
	McpClient,
	McpListedTool,
} from './mcp-client-types.js';

type JsonRpcRequest = {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly method: string;
	readonly params?: unknown;
};

type JsonRpcResponse = {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string };
};

export type McpStdioClientOptions = {
	/** Full shell command line (e.g. `npx ts-scan -mcp`). */
	readonly commandLine: string;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly clientName?: string;
	readonly clientVersion?: string;
};

const contentToText = (content: unknown): string => {
	if (!Array.isArray(content)) {
		return typeof content === 'string' ? content : JSON.stringify(content);
	}

	const parts = content.flatMap((block) => {
		if (
			block !== null &&
			typeof block === 'object' &&
			'type' in block &&
			(block as { type: unknown }).type === 'text' &&
			'text' in block &&
			typeof (block as { text: unknown }).text === 'string'
		) {
			return [(block as { text: string }).text];
		}

		return [JSON.stringify(block)];
	});

	return parts.join('\n');
};

export type McpStdioClient = McpClient;

/**
 * Spawn an MCP server from a full shell CLI line and complete initialize.
 */
export const connectMcpStdioFromCli = async (
	options: McpStdioClientOptions,
): Promise<McpClient> => {
	const commandLine = options.commandLine.trim();

	if (commandLine.length === 0) {
		throw new Error('MCP stdio command is empty.');
	}

	const child: ChildProcessWithoutNullStreams = spawn(commandLine, [], {
		cwd: options.cwd,
		env: envWithShellComSpec({
			...process.env,
			...(options.env ?? {}),
		}),
		stdio: ['pipe', 'pipe', 'pipe'],
		windowsHide: true,
		shell: true,
	});

	let nextId = 1;
	const pending = new Map<
		number,
		{
			readonly resolve: (value: unknown) => void;
			readonly reject: (error: Error) => void;
		}
	>();
	let closed = false;

	const failAll = (error: Error): void => {
		for (const entry of pending.values()) {
			entry.reject(error);
		}

		pending.clear();
	};

	const onStdoutMessage = (raw: unknown): void => {
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
			return;
		}

		const message = raw as JsonRpcResponse;

		if (typeof message.id !== 'number') {
			return;
		}

		const entry = pending.get(message.id);

		if (entry === undefined) {
			return;
		}

		pending.delete(message.id);

		if (message.error !== undefined) {
			entry.reject(
				new Error(
					`MCP JSON-RPC error ${message.error.code}: ${message.error.message}`,
				),
			);
			return;
		}

		entry.resolve(message.result);
	};

	const stdoutParser = createMcpStdioFrameParser(onStdoutMessage);

	child.stdout.on('data', (chunk: Buffer | string) => {
		stdoutParser.push(chunk);
	});

	child.stderr.on('data', () => {
		/* MCP servers often log to stderr; ignore for host stability. */
	});

	child.on('error', (error) => {
		failAll(error instanceof Error ? error : new Error(String(error)));
	});

	child.on('exit', (code, signal) => {
		if (!closed) {
			failAll(
				new Error(
					`MCP server exited (code=${String(code)}, signal=${String(signal)}).`,
				),
			);
		}
	});

	const request = async (
		method: string,
		params?: unknown,
	): Promise<unknown> => {
		if (closed || child.killed || child.stdin.destroyed) {
			throw new Error('MCP client is closed.');
		}

		const id = nextId;
		nextId += 1;
		const payload: JsonRpcRequest = {
			jsonrpc: '2.0',
			id,
			method,
			...(params !== undefined ? { params } : {}),
		};

		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
				if (error !== null) {
					pending.delete(id);
					reject(error);
				}
			});
		});
	};

	const notify = (method: string, params?: unknown): void => {
		const payload = {
			jsonrpc: '2.0' as const,
			method,
			...(params !== undefined ? { params } : {}),
		};
		child.stdin.write(`${JSON.stringify(payload)}\n`);
	};

	const initializeResult = await request('initialize', {
		protocolVersion: '2024-11-05',
		capabilities: {},
		clientInfo: {
			name: options.clientName ?? 'langflower',
			version: options.clientVersion ?? '0.1.0',
		},
	});
	const serverName = requireMcpServerName(initializeResult);
	notify('notifications/initialized');

	return {
		serverName,
		listTools: async () => {
			const result = await request('tools/list', {});
			const tools =
				result !== null &&
				typeof result === 'object' &&
				'tools' in result &&
				Array.isArray((result as { tools: unknown }).tools)
					? (result as { tools: readonly McpListedTool[] }).tools
					: [];

			return tools.filter(
				(tool) =>
					tool !== null &&
					typeof tool === 'object' &&
					typeof tool.name === 'string' &&
					tool.name.length > 0,
			);
		},
		callTool: async (name, args) => {
			try {
				const result = await request('tools/call', {
					name,
					arguments: args,
				});
				const isError =
					result !== null &&
					typeof result === 'object' &&
					'isError' in result &&
					(result as { isError?: unknown }).isError === true;
				const content =
					result !== null &&
					typeof result === 'object' &&
					'content' in result
						? (result as { content: unknown }).content
						: result;
				const text = contentToText(content);

				return { ok: !isError, text };
			} catch (error) {
				return {
					ok: false,
					text:
						error instanceof Error ? error.message : String(error),
				};
			}
		},
		close: async () => {
			if (closed) {
				return;
			}

			closed = true;
			failAll(new Error('MCP client closed.'));

			if (!child.killed) {
				child.kill();
			}

			await new Promise<void>((resolve) => {
				if (child.exitCode !== null) {
					resolve();
					return;
				}

				child.once('exit', () => resolve());
				setTimeout(resolve, 2000);
			});
		},
	};
};
