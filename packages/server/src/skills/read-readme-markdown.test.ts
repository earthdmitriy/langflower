import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readReadmeMarkdown } from './read-readme-markdown.js';

describe('readReadmeMarkdown', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-readme-md-'));
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('returns UTF-8 body when README.md exists at project root', async () => {
		await fs.writeFile(
			path.join(projectDir, 'README.md'),
			'# Project\nHello.',
			'utf8',
		);

		expect(await readReadmeMarkdown(projectDir)).toBe('# Project\nHello.');
	});

	it('returns empty string when README.md is missing', async () => {
		expect(await readReadmeMarkdown(projectDir)).toBe('');
	});
});
