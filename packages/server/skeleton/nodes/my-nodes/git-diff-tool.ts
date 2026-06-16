import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineToolRegistrations } from '@langflower/node-sdk';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 2 * 1024 * 1024;

/**
 * LLM tool pack — wire the `tools` output into an agent / LLM `tools` port.
 * The model calls `git_diff` on demand (optional `path` scopes the diff).
 *
 * Shell is not on the public ExecutionContext yet — uses `child_process`
 * directly. Prefer Caps / host APIs when they ship.
 *
 * For a trigger-driven graph node that emits `diff` as a wire, see
 * `git-diff.ts` (`defineNode`).
 */
export default defineToolRegistrations({
	type: 'my-git-diff-tool',
	displayName: 'Git Diff Tool',
	category: 'Text',
	description:
		'Emits a `git_diff` ToolHandle for agent inventory — runs `git diff` in the project directory on demand.',
	tools: [
		{
			toolId: 'git_diff',
			name: 'git_diff',
			description:
				'Runs `git diff` in the Langflower project directory and returns the patch text. Optional `path` scopes the diff to that path. Empty string means a clean working tree.',
			inputSchema: {
				type: 'object',
				properties: {
					path: {
						type: 'string',
						description:
							'Optional path relative to the project root to scope `git diff -- <path>`.',
					},
				},
				additionalProperties: false,
			},
			handler: async (args, ctx) => {
				const projectDir = String(ctx.projectDir ?? '');
				if (projectDir.length === 0) {
					throw new Error('git_diff requires ctx.projectDir.');
				}

				const pathArg =
					typeof args.path === 'string' ? args.path.trim() : '';
				const gitArgs =
					pathArg.length > 0
						? (['diff', '--', pathArg] as const)
						: (['diff'] as const);

				try {
					const { stdout } = await execFileAsync(
						'git',
						[...gitArgs],
						{
							cwd: projectDir,
							maxBuffer: MAX_BUFFER,
						},
					);
					return String(stdout);
				} catch (err) {
					const message =
						err instanceof Error ? err.message : String(err);
					throw new Error(`git_diff failed: ${message}`);
				}
			},
		},
	],
});
