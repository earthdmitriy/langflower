// git-diff.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineNode } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
var execFileAsync = promisify(execFile);
var git_diff_default = defineNode({
	type: 'my-git-diff',
	displayName: 'Git Diff',
	category: 'Text',
	description:
		'Runs `git diff` in `ctx.projectDir` and emits the patch text.',
	uiSchema: [],
	inputs: {
		trigger: {
			wireType: 'any',
			required: true,
			dynamic: true,
			description: 'Emit to run `git diff`.',
		},
	},
	outputs: {
		diff: {
			wireType: 'string',
			description: 'Stdout from `git diff` (empty string if clean).',
		},
	},
	async execute(ctx) {
		const projectDir = String(ctx.projectDir ?? '');
		if (projectDir.length === 0) {
			throw new Error('Git Diff requires ctx.projectDir.');
		}
		const { stdout } = await execFileAsync('git', ['diff'], {
			cwd: projectDir,
			maxBuffer: 2 * 1024 * 1024,
		});
		return { diff: String(stdout) };
	},
});
export { git_diff_default as default };
