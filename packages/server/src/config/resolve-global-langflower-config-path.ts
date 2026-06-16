import os from 'node:os';
import path from 'node:path';

/**
 * OS-specific absolute path for the global `langflower.jsonc`
 * (ADR-002 amend / CONFIG § Global config).
 */
export const resolveGlobalLangflowerConfigPath = (): string => {
	if (process.platform === 'win32') {
		const appData =
			process.env.APPDATA ??
			path.join(os.homedir(), 'AppData', 'Roaming');
		return path.join(appData, 'langflower', 'langflower.jsonc');
	}

	if (process.platform === 'darwin') {
		return path.join(
			os.homedir(),
			'Library',
			'Application Support',
			'langflower',
			'langflower.jsonc',
		);
	}

	const xdg =
		process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
	return path.join(xdg, 'langflower', 'langflower.jsonc');
};
