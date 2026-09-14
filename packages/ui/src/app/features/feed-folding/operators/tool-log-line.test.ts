import { describe, expect, it } from 'vitest';
import {
	isToolCallFoldValue,
	isUnmatchedToolCall,
	parseToolRequestLine,
	parseToolResponseLine,
} from './tool-log-line';

describe('parseToolRequestLine', () => {
	it('reads name and args from a → line', () => {
		expect(parseToolRequestLine('→ echo({})')).toEqual({
			name: 'echo',
			args: '{}',
		});
		expect(
			parseToolRequestLine('→ Researcher_subagent({"task":"hi"})'),
		).toEqual({
			name: 'Researcher_subagent',
			args: '{"task":"hi"}',
		});
	});

	it('keeps inner parentheses in args', () => {
		expect(parseToolRequestLine('→ bash({command: "echo (hi)"})')).toEqual({
			name: 'bash',
			args: '{command: "echo (hi)"}',
		});
	});

	it('accepts a truncated line that does not close the paren', () => {
		expect(parseToolRequestLine('→ read({path: "/very/long…')).toEqual({
			name: 'read',
			args: '{path: "/very/long…',
		});
	});

	it('ignores notes and non-strings', () => {
		expect(parseToolRequestLine('Paused. Send Steer feedback.')).toBe(
			undefined,
		);
		expect(parseToolRequestLine('← echo: ok')).toBe(undefined);
		expect(parseToolRequestLine(42)).toBe(undefined);
	});
});

describe('parseToolResponseLine', () => {
	it('reads name and result from a ← line', () => {
		expect(parseToolResponseLine('← echo: ok')).toEqual({
			name: 'echo',
			result: 'ok',
		});
		expect(parseToolResponseLine('← echo: Error: denied')).toEqual({
			name: 'echo',
			result: 'Error: denied',
		});
	});

	it('ignores request lines and notes', () => {
		expect(parseToolResponseLine('→ echo({})')).toBe(undefined);
		expect(parseToolResponseLine('⚠ retry')).toBe(undefined);
	});
});

describe('isToolCallFoldValue', () => {
	it('accepts request-only and paired objects', () => {
		expect(isToolCallFoldValue({ name: 'echo', args: '{}' })).toBe(true);
		expect(isUnmatchedToolCall({ name: 'echo', args: '{}' })).toBe(true);
		expect(
			isUnmatchedToolCall({ name: 'echo', args: '{}', result: 'ok' }),
		).toBe(false);
		expect(isToolCallFoldValue('→ echo({})')).toBe(false);
	});
});
