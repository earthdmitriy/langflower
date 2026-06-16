import { spawn } from 'node:child_process';
import { resolveProjectPath } from '../../path-sandbox.js';
import { asString } from '../args.js';
import { fenceOptions } from '../fence.js';
import type { BuiltinTool, HandlerContext } from '../types.js';

const MAX_BASH_OUTPUT = 100_000;

const invoke = async (
	ctx: HandlerContext,
	args: Readonly<Record<string, unknown>>,
): Promise<string> => {
	if (!ctx.bashEnabled) {
		throw new Error(
			'bash is disabled (default-deny). Enable bash on the project harness to run shell commands.',
		);
	}

	const command = asString(args, 'command');

	if (command === undefined || command.trim().length === 0) {
		throw new Error('bash requires string argument «command».');
	}

	const cwdArg = asString(args, 'cwd') ?? '.';
	const cwd = resolveProjectPath(ctx.projectRoot, cwdArg, fenceOptions(ctx));

	return await new Promise((resolve, reject) => {
		const child = spawn(command, {
			cwd,
			shell: true,
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdout += String(chunk);
			if (stdout.length > MAX_BASH_OUTPUT) {
				stdout = stdout.slice(0, MAX_BASH_OUTPUT);
			}
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr += String(chunk);
			if (stderr.length > MAX_BASH_OUTPUT) {
				stderr = stderr.slice(0, MAX_BASH_OUTPUT);
			}
		});
		child.on('error', (error) => {
			reject(error);
		});
		child.on('close', (code) => {
			const combined = [
				`exit ${code ?? 'null'}`,
				stdout.length > 0 ? `stdout:\n${stdout}` : 'stdout: (empty)',
				stderr.length > 0 ? `stderr:\n${stderr}` : 'stderr: (empty)',
			].join('\n');
			resolve(combined);
		});
	});
};

export const bashTool = {
	id: 'bash',
	registration: {
		toolId: 'bash',
		name: 'bash',
		description:
			'Run a shell command in the project root. Disabled unless the harness enables bash (default-deny). Not read-class — no postProcess.',
		inputSchema: {
			type: 'object',
			properties: {
				command: {
					type: 'string',
					description: 'Shell command to run',
				},
				cwd: {
					type: 'string',
					description:
						'Optional subdirectory relative to project root',
				},
			},
			required: ['command'],
			additionalProperties: false,
		},
	},
	invoke,
} as const satisfies BuiltinTool<'bash'>;
