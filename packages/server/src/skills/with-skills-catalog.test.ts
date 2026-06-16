import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { redactLangflowerConfigForBridge } from '../config/redact-langflower-config.js';
import { withSkillsCatalog } from './with-skills-catalog.js';

describe('withSkillsCatalog', () => {
	let projectDir: string;

	beforeEach(async () => {
		projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'lf-skills-merge-'),
		);
	});

	afterEach(async () => {
		await fs.rm(projectDir, { recursive: true, force: true });
	});

	it('merges short catalog metadata and never includes full markdown body', async () => {
		const skillDir = path.join(projectDir, '.langflower', 'skills', 'plan');
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(
			path.join(skillDir, 'SKILL.md'),
			`---
name: Plan
description: Short catalog blurb
---
# Full skill body

This long markdown must not appear on the bridge snapshot.
`,
			'utf8',
		);

		const merged = await withSkillsCatalog(projectDir, {
			provider: { openai: { name: 'OpenAI' } },
		});
		const snapshot = redactLangflowerConfigForBridge(merged);

		expect(snapshot.skills).toEqual([
			{
				id: 'plan',
				name: 'Plan',
				description: 'Short catalog blurb',
			},
		]);
		expect(JSON.stringify(snapshot)).not.toContain('Full skill body');
	});
});
