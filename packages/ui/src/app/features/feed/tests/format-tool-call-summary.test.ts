import { describe, expect, it } from 'vitest';
import {
	formatToolCallBody,
	formatToolCallSummary,
} from '../format-tool-call-summary';

describe('formatToolCallSummary', () => {
	it('shows name and compact args', () => {
		expect(formatToolCallSummary({ name: 'echo', args: '{}' })).toBe(
			'echo({})',
		);
		expect(
			formatToolCallSummary({
				name: 'read',
				args: '{ "path": "/tmp/a" }',
			}),
		).toBe('read({ "path": "/tmp/a" })');
	});

	it('collapses whitespace and caps long args', () => {
		expect(
			formatToolCallSummary({
				name: 'write',
				args: '{\n  "body": "x"\n}',
			}),
		).toBe('write({ "body": "x" })');

		const long = 'a'.repeat(120);
		const summary = formatToolCallSummary({ name: 'read', args: long });
		expect(summary.startsWith('read(')).toBe(true);
		expect(summary.endsWith('…)')).toBe(true);
		expect(summary.slice('read('.length, -1).length).toBe(80);
	});

	it('falls back when the name is empty', () => {
		expect(formatToolCallSummary({ name: '', args: '{}' })).toBe(
			'(tool)({})',
		);
	});
});

describe('formatToolCallBody', () => {
	it('prints full args and full result without shortening', () => {
		const args = `{ "path": "${'a'.repeat(120)}" }`;
		const result = 'b'.repeat(500);
		expect(
			formatToolCallBody({
				name: 'read',
				args,
				result,
			}),
		).toBe(`${args}\n${result}`);
	});

	it('prints args only while the call is still running', () => {
		expect(formatToolCallBody({ name: 'echo', args: '{"x":1}' })).toBe(
			'{"x":1}',
		);
	});

	it('prints result only when args are empty', () => {
		expect(
			formatToolCallBody({ name: 'echo', args: '', result: 'ok' }),
		).toBe('ok');
	});
});
