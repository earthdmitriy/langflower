import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAgentsMarkdown } from './read-agents-markdown.js';

describe('readAgentsMarkdown', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-agents-md-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns UTF-8 body when AGENTS.md exists at project root', async () => {
		await fs.writeFile(
			path.join(projectDir, 'AGENTS.md'),
			'# Project agents\nUse tabs.',
			'utf8',
		);

		expect(await readAgentsMarkdown(projectDir)).toBe(
			'# Project agents\nUse tabs.',
		);
	});

	it('returns empty string when AGENTS.md is missing', async () => {
		expect(await readAgentsMarkdown(projectDir)).toBe('');
	});
});
