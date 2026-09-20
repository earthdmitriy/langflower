import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from './tool.js';

const invoke = async (
	projectRoot: string,
	args: Readonly<Record<string, unknown>>,
): Promise<string> =>
	moveTool.invoke(
		{
			projectRoot,
			denyPaths: [],
			allowedRoots: [],
			bashEnabled: false,
		},
		args,
	);

describe('move builtin', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-move-'));
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
	});

	it('renames a file', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'hello', 'utf8');
		const text = await invoke(projectRoot, {
			from: 'a.txt',
			to: 'b.txt',
		});
		expect(text).toBe('Moved «a.txt» → «b.txt».');
		await expect(
			fs.readFile(path.join(projectRoot, 'a.txt'), 'utf8'),
		).rejects.toThrow();
		expect(await fs.readFile(path.join(projectRoot, 'b.txt'), 'utf8')).toBe(
			'hello',
		);
	});

	it('renames a directory', async () => {
		await fs.mkdir(path.join(projectRoot, 'src'));
		await fs.writeFile(
			path.join(projectRoot, 'src', 'index.ts'),
			'export {};\n',
			'utf8',
		);
		const text = await invoke(projectRoot, {
			from: 'src',
			to: 'lib',
		});
		expect(text).toBe('Moved «src» → «lib».');
		await expect(fs.stat(path.join(projectRoot, 'src'))).rejects.toThrow();
		expect(
			await fs.readFile(
				path.join(projectRoot, 'lib', 'index.ts'),
				'utf8',
			),
		).toBe('export {};\n');
	});

	it('creates destination parent directories', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'x', 'utf8');
		await invoke(projectRoot, {
			from: 'a.txt',
			to: 'nested/dir/b.txt',
		});
		expect(
			await fs.readFile(
				path.join(projectRoot, 'nested', 'dir', 'b.txt'),
				'utf8',
			),
		).toBe('x');
	});

	it('no-ops when from and to resolve to the same path', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'same', 'utf8');
		const text = await invoke(projectRoot, {
			from: 'a.txt',
			to: './a.txt',
		});
		expect(text).toBe('Already at «a.txt».');
		expect(await fs.readFile(path.join(projectRoot, 'a.txt'), 'utf8')).toBe(
			'same',
		);
	});

	it('fails when destination file exists', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'src', 'utf8');
		await fs.writeFile(path.join(projectRoot, 'b.txt'), 'dst', 'utf8');
		await expect(
			invoke(projectRoot, { from: 'a.txt', to: 'b.txt' }),
		).rejects.toThrow(
			/already exists \(file\).*Delete or rename it first/s,
		);
		expect(await fs.readFile(path.join(projectRoot, 'a.txt'), 'utf8')).toBe(
			'src',
		);
		expect(await fs.readFile(path.join(projectRoot, 'b.txt'), 'utf8')).toBe(
			'dst',
		);
	});

	it('fails when destination directory exists', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'src', 'utf8');
		await fs.mkdir(path.join(projectRoot, 'out'));
		await expect(
			invoke(projectRoot, { from: 'a.txt', to: 'out' }),
		).rejects.toThrow(
			/already exists \(directory\).*Delete or rename it first/s,
		);
	});

	it('fails when source is missing', async () => {
		await expect(
			invoke(projectRoot, { from: 'missing.txt', to: 'b.txt' }),
		).rejects.toThrow(/File not found: «missing.txt»/);
	});

	it('refuses moving a directory into itself', async () => {
		await fs.mkdir(path.join(projectRoot, 'src', 'inner'), {
			recursive: true,
		});
		await fs.writeFile(
			path.join(projectRoot, 'src', 'inner', 'x.txt'),
			'x',
			'utf8',
		);
		await expect(
			invoke(projectRoot, { from: 'src', to: 'src/inner/moved' }),
		).rejects.toThrow(/inside source directory/);
		expect(
			await fs.readFile(
				path.join(projectRoot, 'src', 'inner', 'x.txt'),
				'utf8',
			),
		).toBe('x');
	});

	it('denies destination that escapes the project root', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'x', 'utf8');
		await expect(
			invoke(projectRoot, { from: 'a.txt', to: '../outside.txt' }),
		).rejects.toThrow(/escapes project root/);
	});

	it('requires from and to strings', async () => {
		await expect(invoke(projectRoot, { from: 'a.txt' })).rejects.toThrow(
			/«from» and «to»/,
		);
	});
});
