/**
 * Minimal MCP JSON-RPC client over Streamable HTTP (tools/list + tools/call).
 * Supports application/json responses; SSE event-stream bodies with `data:` lines.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type {
	McpCallResult,
	McpClient,
	McpListedTool,
} from './mcp-client-types.js';
import { envWithShellComSpec } from './env-with-shell-com-spec.js';
import { requireMcpServerName } from './require-mcp-server-name.js';

export type McpHttpClientOptions = {
	readonly url: string;
	readonly clientName?: string;
	readonly clientVersion?: string;
	readonly fetchImpl?: typeof fetch;
	readonly headers?: Readonly<Record<string, string>>;
};

type JsonRpcResponse = {
	readonly jsonrpc: '2.0';
	readonly id: number;
	readonly result?: unknown;
	readonly error?: { readonly code: number; readonly message: string };
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

const parseSseJsonRpc = (body: string): JsonRpcResponse | null => {
	for (const line of body.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (!trimmed.startsWith('data:')) {
			continue;
		}

		const payload = trimmed.slice('data:'.length).trim();

		if (payload.length === 0 || payload === '[DONE]') {
			continue;
		}

		try {
			return JSON.parse(payload) as JsonRpcResponse;
		} catch {
			continue;
		}
	}

	return null;
};

/**
 * Connect to an MCP endpoint over Streamable HTTP and complete initialize.
 */
export const connectMcpHttpClient = async (
	options: McpHttpClientOptions,
): Promise<McpClient> => {
	const fetchImpl = options.fetchImpl ?? fetch;
	let nextId = 1;
	let closed = false;
	let sessionId: string | undefined;

	const request = async (
		method: string,
		params?: unknown,
	): Promise<unknown> => {
		if (closed) {
			throw new Error('MCP HTTP client is closed.');
		}

		const id = nextId;
		nextId += 1;
		const payload = {
			jsonrpc: '2.0' as const,
			id,
			method,
			...(params !== undefined ? { params } : {}),
		};

		const response = await fetchImpl(options.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': '2024-11-05',
				...(sessionId !== undefined
					? { 'Mcp-Session-Id': sessionId }
					: {}),
				...(options.headers ?? {}),
			},
			body: JSON.stringify(payload),
		});

		const headerSession = response.headers.get('mcp-session-id');

		if (headerSession !== null && headerSession.length > 0) {
			sessionId = headerSession;
		}

		if (!response.ok) {
			throw new Error(
				`MCP HTTP ${String(response.status)}: ${await response.text()}`,
			);
		}

		const contentType = response.headers.get('content-type') ?? '';
		const text = await response.text();
		const message = contentType.includes('text/event-stream')
			? parseSseJsonRpc(text)
			: (JSON.parse(text) as JsonRpcResponse);

		if (message === null) {
			throw new Error('MCP HTTP response missing JSON-RPC body.');
		}

		if (message.error !== undefined) {
			throw new Error(
				`MCP JSON-RPC error ${message.error.code}: ${message.error.message}`,
			);
		}

		return message.result;
	};

	const notify = async (method: string, params?: unknown): Promise<void> => {
		await fetchImpl(options.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': '2024-11-05',
				...(sessionId !== undefined
					? { 'Mcp-Session-Id': sessionId }
					: {}),
				...(options.headers ?? {}),
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				method,
				...(params !== undefined ? { params } : {}),
			}),
		});
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
	await notify('notifications/initialized');

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

				return { ok: !isError, text: contentToText(content) };
			} catch (error) {
				return {
					ok: false,
					text:
						error instanceof Error ? error.message : String(error),
				};
			}
		},
		close: async () => {
			closed = true;
		},
	};
};

const spawnLaunchProcess = async (options: {
	readonly commandLine: string;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
}): Promise<{ readonly close: () => Promise<void> }> => {
	const child: ChildProcess = spawn(options.commandLine, [], {
		cwd: options.cwd,
		env: envWithShellComSpec({
			...process.env,
			...(options.env ?? {}),
		}),
		stdio: ['ignore', 'ignore', 'ignore'],
		windowsHide: true,
		shell: true,
	});

	return {
		close: async () => {
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

/**
 * Optionally spawn a local process, then connect to `url` with retries.
 */
export const connectMcpHttpWithOptionalLaunch = async (options: {
	readonly url: string;
	readonly command?: string;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
	readonly fetchImpl?: typeof fetch;
	readonly retries?: number;
	readonly retryDelayMs?: number;
}): Promise<{
	readonly client: McpClient;
	readonly close: () => Promise<void>;
}> => {
	let launched: { readonly close: () => Promise<void> } | undefined;

	if (options.command !== undefined && options.command.trim().length > 0) {
		launched = await spawnLaunchProcess({
			commandLine: options.command.trim(),
			...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
			...(options.env !== undefined ? { env: options.env } : {}),
		});
	}

	const retries = options.retries ?? 20;
	const retryDelayMs = options.retryDelayMs ?? 150;
	let lastError: unknown;

	for (let attempt = 0; attempt < retries; attempt += 1) {
		try {
			const client = await connectMcpHttpClient({
				url: options.url,
				...(options.fetchImpl !== undefined
					? { fetchImpl: options.fetchImpl }
					: {}),
			});

			return {
				client,
				close: async () => {
					await client.close();

					if (launched !== undefined) {
						await launched.close();
					}
				},
			};
		} catch (error) {
			lastError = error;

			if (attempt + 1 < retries) {
				await new Promise((resolve) =>
					setTimeout(resolve, retryDelayMs),
				);
			}
		}
	}

	if (launched !== undefined) {
		await launched.close();
	}

	throw lastError instanceof Error
		? lastError
		: new Error(String(lastError ?? 'MCP HTTP connect failed'));
};
