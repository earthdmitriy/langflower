import { defineReactiveNode } from '@langflower/node-sdk';
import { spawn } from 'node:child_process';
import { EMPTY, mergeMap, of } from 'rxjs';

const runNpmTest = (
	projectDir: string,
): Promise<{ readonly exitCode: number; readonly stderr: string }> =>
	new Promise((resolve, reject) => {
		const child = spawn('npm run test', {
			cwd: projectDir,
			shell: true,
			windowsHide: true,
		});
		let stderr = '';

		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr += String(chunk);
			if (stderr.length > 8_000) {
				stderr = stderr.slice(0, 8_000);
			}
		});
		child.on('error', (error) => {
			reject(error);
		});
		child.on('close', (code) => {
			resolve({
				exitCode: code ?? 1,
				stderr,
			});
		});
	});

type GateResult =
	{ readonly ok: true } | { readonly ok: false; readonly detail: string };

/**
 * Hard QA gate: runs `npm run test` in `ctx.projectDir`.
 * Pass → emit on `ok`. Fail → emit on `fail` (independent ports).
 *
 * `defineReactiveNode` is required here: `defineNode` cannot emit on one
 * output and stay silent on the other.
 *
 * Shell is not on the public ExecutionContext yet — this seed uses
 * `child_process` directly. Prefer Caps / host APIs when they ship.
 */
export default defineReactiveNode({
	type: 'my-review-gate',
	displayName: 'Review Gate (npm test)',
	category: 'Logic',
	description:
		'Runs `npm run test` in the project root; emits on `ok` or `fail`.',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			defaultValue: null,
			description: 'Emit to run `npm run test`.',
		});

		const result$ = combineInputs([trigger, ctx], ([_trigger, ec]) => ({
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(async ({ projectDir }): Promise<GateResult> => {
				if (projectDir.length === 0) {
					throw new Error('Review Gate requires ctx.projectDir.');
				}

				const { exitCode, stderr } = await runNpmTest(projectDir);

				if (exitCode === 0) {
					return { ok: true };
				}

				const detail =
					stderr.trim().length > 0
						? stderr.trim()
						: `npm run test failed (exit ${String(exitCode)})`;
				return { ok: false, detail };
			}),
		);

		const ok$ = result$.pipeValue(
			mergeMap((result) => (result.ok ? of(true) : EMPTY)),
		);
		const fail$ = result$.pipeValue(
			mergeMap((result) => (result.ok ? EMPTY : of(result.detail))),
		);

		return {
			inputs: [trigger],
			outputs: [
				configureOutput('ok', ok$, {
					wireType: 'boolean',
					description: 'Emits `true` when `npm run test` exits 0.',
				}),
				configureOutput('fail', fail$, {
					wireType: 'string',
					description:
						'Emits failure detail when `npm run test` exits non-zero.',
				}),
			],
		};
	},
});
