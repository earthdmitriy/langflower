import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectFilesContext } from './create-project-files-context.js';

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

const makeProject = async (): Promise<string> => {
	const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-files-'));
	tempDirs.push(projectDir);
	return projectDir;
};

describe('createProjectFilesContext', () => {
	it('reads and writes project-relative paths', async () => {
		const projectDir = await makeProject();
		const files = createProjectFilesContext({ projectRoot: projectDir });

		await files.write('notes/a.txt', 'hello');
		expect(await files.read('notes/a.txt')).toBe('hello');

		const onDisk = await fs.readFile(
			path.join(projectDir, 'notes', 'a.txt'),
			'utf8',
		);
		expect(onDisk).toBe('hello');
	});

	it('rejects absolute paths', async () => {
		const projectDir = await makeProject();
		const files = createProjectFilesContext({ projectRoot: projectDir });
		const absolute = path.join(projectDir, 'secret.txt');

		await expect(files.read(absolute)).rejects.toThrow(/Absolute paths/);
		await expect(files.write(absolute, 'x')).rejects.toThrow(
			/Absolute paths/,
		);
	});

	it('appends with delimiter when file is non-empty', async () => {
		const projectDir = await makeProject();
		const files = createProjectFilesContext({ projectRoot: projectDir });

		await files.write('log.txt', 'one');
		await files.append('log.txt', 'two', '\n---\n');
		expect(await files.read('log.txt')).toBe('one\n---\ntwo');
	});

	it('appends content only when file is missing or empty', async () => {
		const projectDir = await makeProject();
		const files = createProjectFilesContext({ projectRoot: projectDir });

		await files.append('new.txt', 'first', '\n');
		expect(await files.read('new.txt')).toBe('first');

		await files.write('empty.txt', '');
		await files.append('empty.txt', 'only', '\n');
		expect(await files.read('empty.txt')).toBe('only');
	});

	it('denies sandbox paths', async () => {
		const projectDir = await makeProject();
		const files = createProjectFilesContext({ projectRoot: projectDir });

		await expect(
			files.write('.langflower/secrets/x.txt', 'nope'),
		).rejects.toThrow(/denied by sandbox/);
	});
});
