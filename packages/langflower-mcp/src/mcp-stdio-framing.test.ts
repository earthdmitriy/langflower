import { describe, expect, it, vi } from 'vitest';
import {
	createMcpStdioFrameParser,
	encodeMcpStdioFrame,
} from './mcp-stdio-framing.js';

describe('mcp-stdio-framing', () => {
	it('encodes Content-Length and newline frames', () => {
		const cl = encodeMcpStdioFrame({ id: 1 }, 'content-length').toString(
			'utf8',
		);
		expect(cl.startsWith('Content-Length: ')).toBe(true);
		expect(cl.includes('\r\n\r\n')).toBe(true);

		const nl = encodeMcpStdioFrame({ id: 2 }, 'newline').toString('utf8');
		expect(nl).toBe('{"id":2}\n');
	});

	it('parses Content-Length requests split across chunks', () => {
		const onFrame = vi.fn();
		const parser = createMcpStdioFrameParser(onFrame);
		const frame = encodeMcpStdioFrame(
			{
				jsonrpc: '2.0',
				id: 7,
				method: 'tools/call',
				params: { name: 'ensure_connected', arguments: {} },
			},
			'content-length',
		);

		parser.push(frame.subarray(0, 12));
		expect(onFrame).not.toHaveBeenCalled();
		parser.push(frame.subarray(12));
		expect(onFrame).toHaveBeenCalledOnce();
		expect(onFrame.mock.calls[0]?.[0]).toMatchObject({
			mode: 'content-length',
			message: { id: 7, method: 'tools/call' },
		});
	});

	it('parses Content-Length with LF-only header separators', () => {
		const onFrame = vi.fn();
		const parser = createMcpStdioFrameParser(onFrame);
		const body = '{"jsonrpc":"2.0","id":3,"method":"ping"}';
		parser.push(`Content-Length: ${String(body.length)}\n\n${body}`);
		expect(onFrame).toHaveBeenCalledOnce();
		expect(onFrame.mock.calls[0]?.[0]).toMatchObject({
			mode: 'content-length',
			message: { id: 3, method: 'ping' },
		});
	});

	it('parses legacy newline-delimited JSON', () => {
		const onFrame = vi.fn();
		const parser = createMcpStdioFrameParser(onFrame);
		parser.push(
			'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n',
		);
		expect(onFrame).toHaveBeenCalledOnce();
		expect(onFrame.mock.calls[0]?.[0]).toMatchObject({
			mode: 'newline',
			message: { id: 2, method: 'tools/list' },
		});
	});
});
