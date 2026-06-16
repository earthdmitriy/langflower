/**
 * Ensure Windows shell spawn can find `cmd.exe`.
 * Git Bash / some agent shells leave `ComSpec` empty → `spawn cmd.exe ENOENT`.
 */
export const envWithShellComSpec = (
	env: Readonly<Record<string, string | undefined>>,
): NodeJS.ProcessEnv => {
	if (process.platform !== 'win32') {
		return { ...env };
	}

	const comSpec = env.ComSpec?.trim();

	if (comSpec !== undefined && comSpec.length > 0) {
		return { ...env };
	}

	const systemRoot = env.SystemRoot?.trim() || 'C:\\Windows';

	return {
		...env,
		ComSpec: `${systemRoot}\\System32\\cmd.exe`,
	};
};
