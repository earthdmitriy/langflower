// git-diff-tool.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineToolRegistrations } from 'file:///C:/Users/conKORD/AppData/Roaming/npm/node_modules/langflower/node_modules/@langflower/node-sdk/dist/node-factory/define-reactive-node/define-reactive-node.js';
var execFileAsync = promisify(execFile);
var MAX_BUFFER = 2 * 1024 * 1024;
var git_diff_tool_default = defineToolRegistrations({
	type: 'my-git-diff-tool',
	displayName: 'Git Diff Tool',
	category: 'Text',
	description:
		'Emits a `git_diff` ToolHandle for agent inventory \u2014 runs `git diff` in the project directory on demand.',
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
					pathArg.length > 0 ? ['diff', '--', pathArg] : ['diff'];
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
export { git_diff_tool_default as default };
