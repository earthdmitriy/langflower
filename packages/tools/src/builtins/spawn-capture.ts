import { spawn } from 'node:child_process';

export type SpawnCaptureResult = {
	readonly stdout: string;
	readonly stderr: string;
	readonly code: number | null;
};

export type SpawnCaptureOptions = {
	readonly cwd?: string;
	readonly signal?: AbortSignal;
	readonly maxStdout?: number;
};

/**
 * Async spawn with arg array (no shell). Honors AbortSignal via Node's
 * spawn `signal` (kills the child). Caps captured stdout.
 */
export const spawnCapture = (
	command: string,
	args: readonly string[],
	options: SpawnCaptureOptions = {},
): Promise<SpawnCaptureResult> => {
	const maxStdout = options.maxStdout ?? 2_000_000;

	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new Error('aborted'));
			return;
		}

		const child = spawn(command, [...args], {
			cwd: options.cwd,
			windowsHide: true,
			shell: false,
			...(options.signal !== undefined
				? { signal: options.signal }
				: {}),
		});
		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (chunk: Buffer | string) => {
			if (stdout.length < maxStdout) {
				stdout += String(chunk);
				if (stdout.length > maxStdout) {
					stdout = stdout.slice(0, maxStdout);
				}
			}
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr += String(chunk);
			if (stderr.length > 64_000) {
				stderr = stderr.slice(0, 64_000);
			}
		});
		child.on('error', (error) => {
			reject(error);
		});
		child.on('close', (code) => {
			resolve({ stdout, stderr, code });
		});
	});
};
