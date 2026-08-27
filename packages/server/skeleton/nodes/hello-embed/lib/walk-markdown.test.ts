import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { walkMarkdown } from './walk-markdown.ts';

describe('walkMarkdown', () => {
	let root: string;

	beforeEach(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'hello-embed-walk-'));
	});

	afterEach(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});

	it('walks recursive md and skips node_modules, .git, and .langflower/.cache', async () => {
		await fs.mkdir(path.join(root, 'docs'), { recursive: true });
		await fs.mkdir(path.join(root, 'node_modules', 'pkg'), {
			recursive: true,
		});
		await fs.mkdir(path.join(root, '.git'), { recursive: true });
		await fs.mkdir(
			path.join(root, '.langflower', '.cache', 'hello-embed'),
			{ recursive: true },
		);
		await fs.mkdir(path.join(root, '.langflower', 'skills'), {
			recursive: true,
		});
		await fs.writeFile(path.join(root, 'README.md'), '# Root\n', 'utf8');
		await fs.writeFile(
			path.join(root, 'docs', 'guide.md'),
			'# Guide\n',
			'utf8',
		);
		await fs.writeFile(
			path.join(root, 'node_modules', 'pkg', 'secret.md'),
			'nope',
			'utf8',
		);
		await fs.writeFile(path.join(root, '.git', 'HEAD.md'), 'nope', 'utf8');
		await fs.writeFile(
			path.join(root, '.langflower', '.cache', 'hello-embed', 'x.md'),
			'nope',
			'utf8',
		);
		await fs.writeFile(
			path.join(root, '.langflower', 'skills', 'SKILL.md'),
			'# Skill\n',
			'utf8',
		);

		const files = await walkMarkdown(root);
		const rels = files.map((file) => file.relPath).sort();
		expect(rels).toEqual([
			'.langflower/skills/SKILL.md',
			'README.md',
			'docs/guide.md',
		]);
	});
});
