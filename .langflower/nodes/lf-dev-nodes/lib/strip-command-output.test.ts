import { describe, expect, it } from 'vitest';
import { MAX_ISSUE_LINES, stripCommandOutput } from './strip-command-output.ts';

describe('stripCommandOutput', () => {
	it('returns a one-line ok on success and drops stdout', () => {
		const text = stripCommandOutput({
			label: 'npm_test',
			exitCode: 0,
			stdout: 'ok\n ✓ packages/foo/ok.test.ts (1 test)\nCoverage\n% Stmts',
			stderr: '',
		});
		expect(text).toBe('ok  npm_test');
		expect(text).not.toContain('✓');
		expect(text).not.toContain('Coverage');
	});

	it('extracts Vitest FAIL lines and drops passing tests', () => {
		const stdout = [
			' RUN  v4.0.8',
			'',
			' ✓ packages/foo/ok.test.ts (1 test)',
			' FAIL  packages/foo/bar.test.ts > does the thing',
			'AssertionError: expected 1 to be 2',
			' ❯ packages/foo/bar.test.ts:10:5',
			'',
			' Test Files  1 failed | 1 passed',
			'      Tests  1 failed | 1 passed',
			'% Stmts | % Branch',
		].join('\n');
		const text = stripCommandOutput({
			label: 'npm_test',
			exitCode: 1,
			stdout,
			stderr: '',
		});
		expect(text).toContain('failed  npm_test  (exit 1)');
		expect(text).toContain(
			'FAIL packages/foo/bar.test.ts > does the thing',
		);
		expect(text).toContain('expected 1 to be 2');
		expect(text).not.toContain('✓');
		expect(text).not.toContain('% Stmts');
		expect(text).not.toContain(' RUN  v4');
	});

	it('extracts tsc errors', () => {
		const text = stripCommandOutput({
			label: 'npm_typecheck',
			exitCode: 1,
			stdout: '',
			stderr: [
				'> langflower@0.1.1 typecheck',
				"packages/ui/src/app.ts(12,3): error TS2345: Argument of type 'string' is not assignable.",
			].join('\n'),
		});
		expect(text).toContain(
			"packages/ui/src/app.ts:12:3 TS2345 Argument of type 'string' is not assignable.",
		);
		expect(text).not.toContain('> langflower@');
	});

	it('extracts eslint stylish errors and skips warnings when errors exist', () => {
		const stdout = [
			'packages/foo/src/bar.ts',
			'  12:5  error  Unexpected unused variable  no-unused-vars',
			'  14:1  warning  Missing return  consistent-return',
			'',
			'✖ 2 problems (1 error, 1 warning)',
		].join('\n');
		const text = stripCommandOutput({
			label: 'npm_lint',
			exitCode: 1,
			stdout,
			stderr: '',
		});
		expect(text).toContain(
			'packages/foo/src/bar.ts:12:5 error Unexpected unused variable  no-unused-vars',
		);
		expect(text).not.toContain('warning Missing return');
	});

	it('extracts prettier --check file warnings', () => {
		const text = stripCommandOutput({
			label: 'npm_format_check',
			exitCode: 1,
			stdout: [
				'Checking formatting...',
				'[warn] packages/foo/src/a.ts',
				'[warn] Code style issues found in 1 file.',
			].join('\n'),
			stderr: '',
		});
		expect(text).toContain('packages/foo/src/a.ts format check failed');
		expect(text).not.toContain('Checking formatting');
	});

	it('extracts knip unused files from JSON', () => {
		const text = stripCommandOutput({
			label: 'npm_check_dead_code_json',
			exitCode: 1,
			stdout: JSON.stringify({
				files: ['packages/foo/src/orphan.ts'],
				exports: [{ name: 'unusedFn', file: 'src/a.ts' }],
			}),
			stderr: '',
		});
		expect(text).toContain('unused files: packages/foo/src/orphan.ts');
		expect(text).toContain('unused exports: unusedFn  src/a.ts');
	});

	it('uses the Issues block from format-error print', () => {
		const stderr = [
			'Failed: vitest:unit',
			'2 test failure(s) in vitest:unit',
			'',
			'Issues:',
			'  packages/foo/bar.test.ts > does the thing',
			'    packages/foo/bar.test.ts:10:5',
			'    expected 1 to be 2',
			'',
			'Hint: Re-run suite: node build/test.mjs --unit',
			'',
			'Raw output (last lines):',
			'  noise that should drop',
		].join('\n');
		const text = stripCommandOutput({
			label: 'npm_test',
			exitCode: 1,
			stdout: '',
			stderr,
		});
		expect(text).toContain('packages/foo/bar.test.ts > does the thing');
		expect(text).toContain('expected 1 to be 2');
		expect(text).not.toContain('Hint:');
		expect(text).not.toContain('Raw output');
		expect(text).not.toContain('noise that should drop');
	});

	it('caps issue lines and notes how many were omitted', () => {
		const fails = Array.from({ length: MAX_ISSUE_LINES + 5 }, (_, i) =>
			[
				` FAIL  packages/foo/a.test.ts > case ${String(i)}`,
				'AssertionError: boom',
			].join('\n'),
		).join('\n');
		const text = stripCommandOutput({
			label: 'npm_test',
			exitCode: 1,
			stdout: fails,
			stderr: '',
		});
		expect(text).toContain('more issues omitted');
		expect(text.length).toBeLessThanOrEqual(8_000);
	});

	it('falls back to the last non-noise lines when nothing parses', () => {
		const text = stripCommandOutput({
			label: 'npm_build',
			exitCode: 1,
			stdout: [
				'> langflower@0.1.1 build',
				'npm warn skipping',
				'step one',
				'step two exploded',
			].join('\n'),
			stderr: '',
		});
		expect(text).toContain('failed  npm_build  (exit 1)');
		expect(text).toContain('step two exploded');
		expect(text).not.toContain('npm warn');
		expect(text).not.toContain('> langflower@');
	});

	it('labels timeouts', () => {
		const text = stripCommandOutput({
			label: 'npm_test',
			exitCode: null,
			timedOut: true,
			stdout: '',
			stderr: '',
		});
		expect(text).toBe('failed  npm_test  (timeout)');
	});
});
