/**
 * Contract: tools owns MCP tool-id encode/parse; shared keeps a boundary twin
 * (neither package may import the other in production). Relative import of the
 * twin source is test-only. Fail this test → update both copies.
 */
import { describe, expect, it } from 'vitest';
import {
	encodeMcpToolId as sharedEncode,
	isMcpToolId as sharedIsMcp,
	isValidMcpServerId as sharedIsValidServer,
	parseMcpToolId as sharedParse,
} from '../../../shared/src/langflower-config/mcp-tool-id.js';
import {
	encodeMcpToolId as toolsEncode,
	isMcpToolId as toolsIsMcp,
	isValidMcpServerId as toolsIsValidServer,
	parseMcpToolId as toolsParse,
} from './mcp-tool-id.js';

const ENCODE_CASES: readonly (readonly [string, string])[] = [
	['echo', 'echo'],
	['my-server', 'list_tools'],
	['  spaced  ', '  name  '],
	['has.dots', 'tool/name'],
	['___', 'ok'],
	['ok', '___'],
	['', 'echo'],
	['echo', ''],
];

const PARSE_CASES: readonly string[] = [
	'echo__echo',
	'my-server__list_tools',
	'a__b__c',
	'  echo__echo  ',
	'___bad',
	'not-mcp',
	'',
	'server__',
	'mcp_echo__echo',
];

describe('mcp-tool-id parity (tools owner ↔ shared twin)', () => {
	it('encodeMcpToolId matches for representative inputs', () => {
		for (const [serverId, toolName] of ENCODE_CASES) {
			expect(toolsEncode(serverId, toolName)).toBe(
				sharedEncode(serverId, toolName),
			);
		}
	});

	it('parseMcpToolId matches for representative inputs', () => {
		for (const toolId of PARSE_CASES) {
			expect(toolsParse(toolId)).toEqual(sharedParse(toolId));
		}
	});

	it('isMcpToolId and isValidMcpServerId match', () => {
		const serverIds = ['echo', 'my-server', '1bad', '', 'A', 'a_b'];
		for (const id of serverIds) {
			expect(toolsIsValidServer(id)).toBe(sharedIsValidServer(id));
		}

		for (const toolId of PARSE_CASES) {
			expect(toolsIsMcp(toolId)).toBe(sharedIsMcp(toolId));
		}
	});

	it('round-trip encode → parse agrees on both sides', () => {
		const encoded = toolsEncode('echo', 'ping');
		expect(encoded).toBe('echo__ping');
		expect(encoded).toBe(sharedEncode('echo', 'ping'));
		expect(toolsParse(encoded)).toEqual(sharedParse(encoded));
		expect(toolsParse(encoded)).toEqual({
			serverId: 'echo',
			toolName: 'ping',
		});
	});
});
