import { describe, expect, it } from 'vitest';
import {
	encodeMcpToolId,
	isMcpToolId,
	isValidMcpServerId,
	parseMcpToolId,
} from './mcp-tool-id.js';

describe('mcp-tool-id', () => {
	it('encodes OpenAI-safe inventory ids', () => {
		expect(encodeMcpToolId('echo', 'echo')).toBe('echo__echo');
		expect(encodeMcpToolId('my-server', 'list_tools')).toBe(
			'my-server__list_tools',
		);
		expect(encodeMcpToolId('  spaced  ', '  name  ')).toBe('spaced__name');
		expect(encodeMcpToolId('has.dots', 'tool/name')).toBe(
			'has_dots__tool_name',
		);
		expect(encodeMcpToolId('___', 'ok')).toBe('');
		expect(encodeMcpToolId('ok', '___')).toBe('');
		expect(encodeMcpToolId('', 'echo')).toBe('');
		expect(encodeMcpToolId('echo', '')).toBe('');
	});

	it('parses inventory ids and rejects malformed strings', () => {
		expect(parseMcpToolId('echo__echo')).toEqual({
			serverId: 'echo',
			toolName: 'echo',
		});
		expect(parseMcpToolId('my-server__list_tools')).toEqual({
			serverId: 'my-server',
			toolName: 'list_tools',
		});
		expect(parseMcpToolId('a__b__c')).toEqual({
			serverId: 'a__b',
			toolName: 'c',
		});
		expect(parseMcpToolId('  echo__echo  ')).toEqual({
			serverId: 'echo',
			toolName: 'echo',
		});
		expect(parseMcpToolId('__echo')).toBeNull();
		expect(parseMcpToolId('not-mcp')).toBeNull();
		expect(parseMcpToolId('')).toBeNull();
		expect(parseMcpToolId('server__')).toBeNull();
	});

	it('validates jsonc MCP server ids', () => {
		expect(isValidMcpServerId('echo')).toBe(true);
		expect(isValidMcpServerId('my-server')).toBe(true);
		expect(isValidMcpServerId('A')).toBe(true);
		expect(isValidMcpServerId('1bad')).toBe(false);
		expect(isValidMcpServerId('')).toBe(false);
		expect(isValidMcpServerId('a_b')).toBe(false);
	});

	it('round-trips encode → parse', () => {
		const encoded = encodeMcpToolId('echo', 'ping');
		expect(encoded).toBe('echo__ping');
		expect(isMcpToolId(encoded)).toBe(true);
		expect(parseMcpToolId(encoded)).toEqual({
			serverId: 'echo',
			toolName: 'ping',
		});
	});
});
