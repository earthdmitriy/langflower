import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	formatCompilePackError,
	formatDiagnosticLine,
	renderCompilationErrorsMarkdown,
	toProjectRelativePath,
} from './format-compilation-errors.js';

describe('format-compilation-errors', () => {
	const projectDir = path.join('D:', 'proj');

	it('relativizes paths under the project root', () => {
		const absolute = path.join(
			projectDir,
			'.langflower',
			'nodes',
			'my-nodes',
			'review-gate.ts',
		);

		expect(toProjectRelativePath(absolute, projectDir)).toBe(
			'.langflower/nodes/my-nodes/review-gate.ts',
		);
	});

	it('formats pack error message identical to markdown body lines', () => {
		const absolute = path.join(
			projectDir,
			'.langflower',
			'nodes',
			'my-nodes',
			'review-gate.ts',
		);
		const error = formatCompilePackError(
			'my-nodes',
			[
				{
					file: absolute,
					line: 27,
					column: 15,
					message: "Cannot find name 'codee'.",
				},
			],
			projectDir,
		);

		expect(error.message).toBe(
			"- .langflower/nodes/my-nodes/review-gate.ts:27:15: Cannot find name 'codee'.",
		);
		expect(error.diagnostics[0]?.file).toBe(
			'.langflower/nodes/my-nodes/review-gate.ts',
		);

		const markdown = renderCompilationErrorsMarkdown('my-nodes', [error]);
		expect(markdown).toContain(error.message);
		expect(markdown).not.toContain('Typecheck failed');
		expect(markdown).not.toMatch(/^[A-Za-z]:\\/m);
	});

	it('formats a diagnostic without inventing a wrapper title', () => {
		expect(
			formatDiagnosticLine({
				file: '.langflower/nodes/x.ts',
				line: 1,
				column: 2,
				message: 'boom',
			}),
		).toBe('- .langflower/nodes/x.ts:1:2: boom');
	});
});
