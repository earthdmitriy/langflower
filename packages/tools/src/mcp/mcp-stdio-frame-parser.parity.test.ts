/**
 * Contract: tools client parser and langflower-mcp server parser accept the
 * same Content-Length (CRLF + LF) and newline JSON bytes. DAG forbids a
 * production import either way. Relative import of the mcp twin is test-only.
 */
import { describe, expect, it } from 'vitest';
import {
	createMcpStdioFrameParser as createMcpParser,
	encodeMcpStdioFrame,
} from '../../../langflower-mcp/src/mcp-stdio-framing.js';
import { createMcpStdioFrameParser as createToolsParser } from './mcp-stdio-frame-parser.js';

const ping = {
	jsonrpc: '2.0',
	id: 3,
	method: 'ping',
} as const;

const collectTools = (bytes: Buffer | string): readonly unknown[] => {
	const messages: unknown[] = [];
	const parser = createToolsParser((message) => {
		messages.push(message);
	});
	parser.push(bytes);
	return messages;
};

const collectMcp = (bytes: Buffer | string): readonly unknown[] => {
	const messages: unknown[] = [];
	const parser = createMcpParser((frame) => {
		messages.push(frame.message);
	});
	parser.push(bytes);
	return messages;
};

const collectBothSplit = (
	bytes: Buffer,
): {
	readonly tools: readonly unknown[];
	readonly mcp: readonly unknown[];
} => {
	const tools: unknown[] = [];
	const mcp: unknown[] = [];
	const toolsParser = createToolsParser((message) => {
		tools.push(message);
	});
	const mcpParser = createMcpParser((frame) => {
		mcp.push(frame.message);
	});
	const cut = Math.min(12, bytes.length);
	toolsParser.push(bytes.subarray(0, cut));
	mcpParser.push(bytes.subarray(0, cut));
	toolsParser.push(bytes.subarray(cut));
	mcpParser.push(bytes.subarray(cut));
	return { tools, mcp };
};

describe('mcp stdio frame parser parity (tools ↔ langflower-mcp)', () => {
	it('parses CRLF Content-Length the same way', () => {
		const bytes = encodeMcpStdioFrame(ping, 'content-length');
		expect(collectTools(bytes)).toEqual(collectMcp(bytes));
		expect(collectTools(bytes)).toEqual([ping]);
	});

	it('parses LF-only Content-Length headers the same way', () => {
		const body = JSON.stringify(ping);
		const bytes = `Content-Length: ${String(body.length)}\n\n${body}`;
		expect(collectTools(bytes)).toEqual(collectMcp(bytes));
		expect(collectTools(bytes)).toEqual([ping]);
	});

	it('parses newline JSON the same way', () => {
		const bytes = encodeMcpStdioFrame(ping, 'newline');
		expect(collectTools(bytes)).toEqual(collectMcp(bytes));
		expect(collectTools(bytes)).toEqual([ping]);
	});

	it('parses split Content-Length chunks the same way', () => {
		const bytes = encodeMcpStdioFrame(ping, 'content-length');
		const { tools, mcp } = collectBothSplit(bytes);
		expect(tools).toEqual(mcp);
		expect(tools).toEqual([ping]);
	});

	it('drops malformed JSON and non-object frames on both sides', () => {
		expect(collectTools('not-json\n')).toEqual(collectMcp('not-json\n'));
		expect(collectTools('[1,2]\n')).toEqual(collectMcp('[1,2]\n'));
		expect(collectTools('not-json\n')).toEqual([]);
	});
});
