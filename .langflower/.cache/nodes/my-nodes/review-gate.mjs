// review-gate.ts
import { defineReactiveNode } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
import { spawn } from 'node:child_process';
import {
	EMPTY,
	mergeMap,
	of,
} from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/rxjs/dist/cjs/index.js';
var runNpmTest = (projectDir) =>
	new Promise((resolve, reject) => {
		const child = spawn('npm run test', {
			cwd: projectDir,
			shell: true,
			windowsHide: true,
		});
		let stderr = '';
		child.stderr?.on('data', (chunk) => {
			stderr += String(chunk);
			if (stderr.length > 8e3) {
				stderr = stderr.slice(0, 8e3);
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
var review_gate_default = defineReactiveNode({
	type: 'my-review-gate',
	displayName: 'Review Gate (npm test)',
	category: 'Logic',
	description:
		'Runs `npm run test` in the project root; emits on `ok` or `fail`.',
	uiSchema: [],
	bind(ctx, { makeInput, configureOutput, combineInputs }) {
		const trigger = makeInput('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			defaultValue: null,
			description: 'Emit to run `npm run test`.',
		});
		const result$ = combineInputs([trigger, ctx], ([_trigger, ec]) => ({
			projectDir: String(ec.projectDir ?? ''),
		})).pipeValue(
			mergeMap(async ({ projectDir }) => {
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
export { review_gate_default as default };
