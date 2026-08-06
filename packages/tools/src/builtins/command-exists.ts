import { spawn } from 'node:child_process';

const cache = new Map<string, boolean>();

/**
 * True when `cmd` resolves on PATH (`where` on Windows, `which` elsewhere).
 * Result is cached per process.
 */
export const commandExists = async (cmd: string): Promise<boolean> => {
	const cached = cache.get(cmd);

	if (cached !== undefined) {
		return cached;
	}

	const checkCmd = process.platform === 'win32' ? 'where' : 'which';
	const exists = await new Promise<boolean>((resolve) => {
		const child = spawn(checkCmd, [cmd], {
			stdio: 'ignore',
			windowsHide: true,
		});
		child.on('error', () => {
			resolve(false);
		});
		child.on('close', (code) => {
			resolve(code === 0);
		});
	});

	cache.set(cmd, exists);
	return exists;
};
