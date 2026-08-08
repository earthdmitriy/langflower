import { defineReactiveNode } from '@langflower/node-sdk';
import { spawn } from 'node:child_process';
import { EMPTY, mergeMap, of } from 'rxjs';

const runCommand = (
	command: string,
	projectDir: string,
): Promise<{ readonly exitCode: number; readonly output: string }> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, {
			cwd: projectDir,
			shell: true,
			windowsHide: true,
		});
		let output = '';

		const pipe = (chunk: Buffer | string) => {
			output += String(chunk);
			if (output.length > 8_000) {
				output = output.slice(0, 8_000);
			}
		};
		child.stdout?.on('data', pipe);
		child.stderr?.on('data', pipe);
		child.on('error', (error) => {
			reject(error);
		});
		child.on('close', (code) => {
			resolve({
				exitCode: code ?? 1,
				output,
			});
		});
	});

type GateResult =
	{ readonly ok: true } | { readonly ok: false; readonly detail: string };

/**
 * Project review gate: runs `npm run format` then `npm run test` in
 * `ctx.projectDir`. Both must pass → emit on `ok`. First failure → emit on
 * `fail` with its output (format runs first; test only if format passed).
 *
 * `defineReactiveNode` is required so we can emit on one output and stay
 * silent on the other.
 */
export default defineReactiveNode({
	type: 'langflower-review-gate',
	displayName: 'Langflower Review Gate',
	category: 'Logic',
	description:
		'Runs `npm run format` then `npm run test`; emits on `ok` or `fail`.',
	uiSchema: [] as const,
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			defaultValue: null,
			description: 'Emit to run `npm run format` then `npm run test`.',
		});

		const result$ = combineInputs([trigger, ctx], ([_trigger, ec]) => ({
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(async ({ projectDir }): Promise<GateResult> => {
				if (projectDir.length === 0) {
					throw new Error(
						'Langflower Review Gate requires ctx.projectDir.',
					);
				}

				const format = await runCommand('npm run format', projectDir);
				if (format.exitCode !== 0) {
					const detail =
						format.output.trim().length > 0
							? format.output.trim()
							: 'npm run format failed';
					return { ok: false, detail };
				}

				const test = await runCommand('npm run test', projectDir);
				if (test.exitCode !== 0) {
					const detail =
						test.output.trim().length > 0
							? test.output.trim()
							: 'npm run test failed';
					return { ok: false, detail };
				}

				return { ok: true };
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
					description:
						'Emits `true` when both `npm run format` and `npm run test` pass.',
				}),
				configureOutput('fail', fail$, {
					wireType: 'string',
					description:
						'Emits failure detail when `npm run format` or `npm run test` fails.',
				}),
			],
		};
	},
});
