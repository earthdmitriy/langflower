import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@langflower/shared/constants/defaults.js';
import { ConfigService } from './config.service.js';

describe('ConfigService', () => {
	let projectDir: string;
	let service: ConfigService;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-tool-config-'),
		);
		service = new ConfigService(projectDir);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns defaults when config.json is missing', async () => {
		await expect(service.read()).resolves.toEqual({
			ok: true,
			config: { ...DEFAULT_CONFIG, projectDir },
		});
	});

	it('parses port from config.json', async () => {
		const configPath = path.join(projectDir, '.langflower', 'config.json');
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(
			configPath,
			`${JSON.stringify({ port: 4123 }, null, '\t')}\n`,
			'utf8',
		);

		await expect(service.read()).resolves.toEqual({
			ok: true,
			config: { port: 4123, projectDir },
		});
	});

	it('does not treat a corrupt config.json as defaults', async () => {
		const configPath = path.join(projectDir, '.langflower', 'config.json');
		const corrupt = '{ "port": 4123,\n';
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(configPath, corrupt, 'utf8');

		const read = await service.read();
		expect(read.ok).toBe(false);
		if (!read.ok) {
			expect(read.code).toBe('INVALID');
			expect(read.message.length).toBeGreaterThan(0);
		}

		expect(await fs.readFile(configPath, 'utf8')).toBe(corrupt);
	});
});
