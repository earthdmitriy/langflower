import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listSkills } from './list-skills.js';

describe('listSkills', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-skills-list-'),
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

	it('returns ids for folders with SKILL.md and ignores empty dirs', async () => {
		await fs.mkdir(
			path.join(projectDir, '.langflower', 'skills', 'empty-dir'),
			{ recursive: true },
		);
		await writeSkill(
			'plan',
			`---
name: Plan
description: Planning skill
---
Body
`,
		);

		await expect(listSkills(projectDir)).resolves.toEqual([
			{
				id: 'plan',
				name: 'Plan',
				description: 'Planning skill',
			},
		]);
	});

	it('falls back to folder id and truncated body line without frontmatter', async () => {
		await writeSkill('explorer', 'First catalog line from the body.');

		await expect(listSkills(projectDir)).resolves.toEqual([
			{
				id: 'explorer',
				name: 'explorer',
				description: 'First catalog line from the body.',
			},
		]);
	});
});
