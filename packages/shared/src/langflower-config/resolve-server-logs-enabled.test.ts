import { describe, expect, it } from 'vitest';
import { resolveServerLogsEnabled } from './resolve-server-logs-enabled.js';

describe('resolveServerLogsEnabled', () => {
	it('defaults to enabled when serverLogs is omitted', () => {
		expect(resolveServerLogsEnabled({})).toBe(true);
	});

	it('respects explicit true and false', () => {
		expect(resolveServerLogsEnabled({ serverLogs: true })).toBe(true);
		expect(resolveServerLogsEnabled({ serverLogs: false })).toBe(false);
	});
});
