import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG } from '@langflower/shared/constants/defaults.js';
import type { ToolConfig } from '@langflower/shared/types/config.js';

const isEnoent = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	(error as { readonly code: unknown }).code === 'ENOENT';

const ioErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export type ConfigReadResult =
	| { readonly ok: true; readonly config: ToolConfig }
	| {
			readonly ok: false;
			readonly code: 'INVALID';
			readonly message: string;
	  };

export class ConfigService {
	constructor(private readonly projectDir: string) {}

	private configPath(): string {
		return path.join(this.projectDir, '.langflower', 'config.json');
	}

	/**
	 * Missing file (`ENOENT`) → defaults. Existing unreadable / unparsable
	 * body is `INVALID` — callers must not treat that as a parsed file.
	 */
	async read(): Promise<ConfigReadResult> {
		let raw: string;
		try {
			raw = await fs.readFile(this.configPath(), 'utf8');
		} catch (error) {
			if (isEnoent(error)) {
				return {
					ok: true,
					config: { ...DEFAULT_CONFIG, projectDir: this.projectDir },
				};
			}

			return {
				ok: false,
				code: 'INVALID',
				message: ioErrorMessage(error),
			};
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			return {
				ok: false,
				code: 'INVALID',
				message: ioErrorMessage(error),
			};
		}

		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return {
				ok: false,
				code: 'INVALID',
				message: 'config.json must be a JSON object',
			};
		}

		const record = parsed as Partial<ToolConfig>;

		return {
			ok: true,
			config: {
				port:
					typeof record.port === 'number'
						? record.port
						: DEFAULT_CONFIG.port,
				projectDir: this.projectDir,
			},
		};
	}
}
