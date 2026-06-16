/**
 * Run a local node_modules binary cross-platform.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './paths.mjs';

function resolveBin(name) {
	const winName = process.platform === 'win32' ? `${name}.cmd` : name;
	return path.join(ROOT, 'node_modules', '.bin', winName);
}

/**
 * @param {string} name — binary name (prettier, eslint)
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string>, quiet?: boolean }} [options]
 */
export function runBin(name, args, options = {}) {
	const { cwd = ROOT, env = {}, quiet = false } = options;
	const binPath = resolveBin(name);

	return new Promise((resolve, reject) => {
		const child = spawn(binPath, args, {
			cwd,
			env: { ...process.env, ...env },
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			const text = chunk.toString();
			stdout += text;
			if (!quiet) {
				process.stdout.write(text);
			}
		});

		child.stderr.on('data', (chunk) => {
			const text = chunk.toString();
			stderr += text;
			if (!quiet) {
				process.stderr.write(text);
			}
		});

		child.on('error', (error) => {
			reject({ error, stdout, stderr });
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}

			reject({ stdout, stderr, exitCode: code ?? 1 });
		});
	});
}
