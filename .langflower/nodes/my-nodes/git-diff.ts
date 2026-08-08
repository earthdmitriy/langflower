import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineNode } from '@langflower/node-sdk';

const execFileAsync = promisify(execFile);

/**
 * Simple sync/Promise node — one output, no exclusive branches.
 * Prefer `defineNode` for this shape; see `review-gate.ts` for ok/fail.
 *
 * Shell is not on the public ExecutionContext yet — uses `child_process`
 * directly. Prefer Caps / host APIs when they ship.
 */
export default defineNode({
	type: 'my-git-diff',
	displayName: 'Git Diff',
	category: 'Text',
	description:
		'Runs `git diff` in `ctx.projectDir` and emits the patch text.',
	uiSchema: [] as const,
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
