import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSkillMarkdown } from './read-skill-markdown.js';

describe('readSkillMarkdown', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-skills-read-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	const writeSkill = async (id: string, content: string): Promise<void> => {
		const dir = path.join(projectDir, '.langflower', 'skills', id);
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf8');
	};

	it('rejects path traversal and returns empty string for missing skill', async () => {
		await expect(readSkillMarkdown(projectDir, '../secret')).resolves.toBe(
			'',
		);
		await expect(readSkillMarkdown(projectDir, 'a/b')).resolves.toBe('');
		await expect(readSkillMarkdown(projectDir, 'missing')).resolves.toBe(
			'',
		);
	});

	it('returns updated content on every read without caching', async () => {
		await writeSkill('coder', 'version-one');
		await expect(readSkillMarkdown(projectDir, 'coder')).resolves.toBe(
			'version-one',
		);

		await writeSkill('coder', 'version-two');
		await expect(readSkillMarkdown(projectDir, 'coder')).resolves.toBe(
			'version-two',
		);
	});
});
