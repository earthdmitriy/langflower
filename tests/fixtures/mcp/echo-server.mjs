#!/usr/bin/env node
/**
 * Minimal stdio MCP fixture server — one tool `echo`.
 * Speaks JSON-RPC lines on stdin/stdout (MCP 2024-11-05 subset).
 */

import { createInterface } from 'node:readline';

const write = (message) => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

const tools = [
	{
		name: 'echo',
		description: 'Echo a message back (Langflower MCP fixture).',
		inputSchema: {
			type: 'object',
			properties: {
				message: { type: 'string', description: 'Text to echo' },
			},
			required: ['message'],
		},
	},
];

const handle = (message) => {
	if (message === null || typeof message !== 'object') {
		return;
	}

	const { id, method, params } = message;

	if (method === 'initialize') {
		write({
			jsonrpc: '2.0',
			id,
			result: {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'langflower-echo-mcp', version: '0.1.0' },
			},
		});
		return;
	}

	if (method === 'notifications/initialized' || method === 'ping') {
		return;
	}

	if (method === 'tools/list') {
		write({ jsonrpc: '2.0', id, result: { tools } });
		return;
	}

	if (method === 'tools/call') {
		const name = params?.name;
		const args = params?.arguments ?? {};

		if (name !== 'echo') {
			write({
				jsonrpc: '2.0',
				id,
				result: {
					isError: true,
					content: [
						{ type: 'text', text: `Unknown tool: ${String(name)}` },
					],
				},
			});
			return;
		}

		const messageText =
			typeof args.message === 'string' ? args.message : '';
		write({
			jsonrpc: '2.0',
			id,
			result: {
				content: [
					{
						type: 'text',
						text: `echo:${messageText}`,
					},
				],
			},
		});
		return;
	}

	if (typeof id === 'number') {
		write({
			jsonrpc: '2.0',
			id,
			error: { code: -32601, message: `Method not found: ${method}` },
		});
	}
};

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
	const trimmed = line.trim();

	if (trimmed.length === 0) {
		return;
	}

	try {
		handle(JSON.parse(trimmed));
	} catch (error) {
		process.stderr.write(`echo-server parse error: ${error}\n`);
	}
});
