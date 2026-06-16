/**
 * Cross-platform npm process launcher.
 *
 * Uses shell mode so the same code works from bash (macOS/Linux/Git Bash)
 * and from Windows terminals without special-casing cmd.exe.
 */

import { spawn } from 'node:child_process';

/**
 * Build npm CLI arguments for a workspace script.
 */
export function buildNpmArgs({ script, workspace }) {
	if (workspace) {
		return ['run', script, '-w', workspace];
	}

	return ['run', script];
}

/**
 * Run `npm` and collect stdout/stderr.
 * Resolves on exit code 0, rejects with captured output otherwise.
 */
export function runNpm({ args, cwd, env = {}, onStdout, onStderr }) {
	return new Promise((resolve, reject) => {
		const child = spawn('npm', args, {
			cwd,
			env: { ...process.env, ...env },
			// shell: true — required for cross-platform npm resolution
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			const text = chunk.toString();
			stdout += text;
			onStdout?.(text);
		});

		child.stderr.on('data', (chunk) => {
			const text = chunk.toString();
			stderr += text;
			onStderr?.(text);
		});

		child.on('error', (error) => {
			reject({ error, stdout, stderr });
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr, exitCode: 0 });
				return;
			}

			reject({ stdout, stderr, exitCode: code ?? 1 });
		});
	});
}
