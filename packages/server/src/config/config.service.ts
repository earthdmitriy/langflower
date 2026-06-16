import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG } from '@langflower/shared/constants/defaults.js';
import type { ToolConfig } from '@langflower/shared/types/config.js';

export type { ToolConfig };

export class ConfigService {
	constructor(private readonly projectDir: string) {}

	private configPath(): string {
		return path.join(this.projectDir, '.langflower', 'config.json');
	}

	async read(): Promise<ToolConfig> {
		try {
			const raw = await fs.readFile(this.configPath(), 'utf8');
			const parsed = JSON.parse(raw) as Partial<ToolConfig>;

			return {
				port:
					typeof parsed.port === 'number'
						? parsed.port
						: DEFAULT_CONFIG.port,
				projectDir: this.projectDir,
			};
		} catch {
			return { ...DEFAULT_CONFIG, projectDir: this.projectDir };
		}
	}

	async write(config: ToolConfig): Promise<void> {
		await fs.mkdir(path.dirname(this.configPath()), { recursive: true });
		await fs.writeFile(
			this.configPath(),
			`${JSON.stringify({ ...config, projectDir: this.projectDir }, null, 2)}\n`,
			'utf8',
		);
	}
}
