import { describe, expect, it } from 'vitest';
import { formatMcpConnectError } from './format-mcp-connect-error.js';

describe('formatMcpConnectError', () => {
	it('includes node id, kind, and cause message', () => {
		const error = formatMcpConnectError(new Error('spawn ENOENT'), {
			nodeId: 'mcp-1',
			kind: 'stdio',
			target: 'npx missing-mcp',
		});
		expect(error.message).toContain('MCP stdio connect failed');
		expect(error.message).toContain('mcp-1');
		expect(error.message).toContain('npx missing-mcp');
		expect(error.message).toContain('spawn ENOENT');
	});

	it('includes system kind for project MCP', () => {
		const error = formatMcpConnectError(new Error('spawn ENOENT'), {
			nodeId: 'echo',
			kind: 'system',
			target: 'npx bad',
		});
		expect(error.message).toMatch(/MCP system connect failed/);
		expect(error.message).toContain('echo');
	});

	it('truncates long targets', () => {
		const long = 'x'.repeat(120);
		const error = formatMcpConnectError('boom', {
			nodeId: 'n',
			kind: 'http',
			target: long,
		});
		expect(error.message).toContain('…');
		expect(error.message.length).toBeLessThan(200);
	});
});
