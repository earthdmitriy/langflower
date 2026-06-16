import { describe, expect, it } from 'vitest';
import { requireMcpServerName } from './require-mcp-server-name.js';

describe('requireMcpServerName', () => {
	it('returns trimmed serverInfo.name', () => {
		expect(
			requireMcpServerName({
				serverInfo: { name: '  echo-mcp  ', version: '1' },
			}),
		).toBe('echo-mcp');
	});

	it('fails when serverInfo.name is missing or empty', () => {
		expect(() => requireMcpServerName({})).toThrow(/serverInfo/);
		expect(() =>
			requireMcpServerName({ serverInfo: { name: '  ' } }),
		).toThrow(/empty/);
	});
});
