import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	resolveFenceRoot,
	resolveProjectPath,
	toHarnessDisplayPath,
} from './path-sandbox.js';

describe('path-sandbox allowedRoots', () => {
	let projectRoot: string;
	let vaultRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-proj-'));
		vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-vault-'));
		await fs.writeFile(path.join(vaultRoot, 'note.md'), '# hi', 'utf8');
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
		await fs.rm(vaultRoot, { recursive: true, force: true });
	});

	it('rejects escape when allowedRoots is empty', () => {
		expect(() =>
			resolveProjectPath(projectRoot, path.join(vaultRoot, 'note.md')),
		).toThrow(/escapes project root/);
	});

	it('allows absolute paths under harness.allowedRoots', () => {
		const absolute = path.join(vaultRoot, 'note.md');
		const resolved = resolveProjectPath(projectRoot, absolute, {
			allowedRoots: [vaultRoot],
		});
		expect(resolved).toBe(path.resolve(absolute));
		expect(resolveFenceRoot(projectRoot, resolved, [vaultRoot])).toBe(
			path.resolve(vaultRoot),
		);
		expect(toHarnessDisplayPath(projectRoot, resolved, [vaultRoot])).toBe(
			absolute.split(path.sep).join('/'),
		);
	});

	it('still resolves project-relative paths', async () => {
		await fs.writeFile(path.join(projectRoot, 'in.md'), 'x', 'utf8');
		const resolved = resolveProjectPath(projectRoot, 'in.md', {
			allowedRoots: [vaultRoot],
		});
		expect(resolved).toBe(path.join(projectRoot, 'in.md'));
		expect(toHarnessDisplayPath(projectRoot, resolved, [vaultRoot])).toBe(
			'in.md',
		);
	});

	it('applies deny patterns inside an allowed vault', () => {
		expect(() =>
			resolveProjectPath(
				projectRoot,
				path.join(vaultRoot, '.git', 'config'),
				{ allowedRoots: [vaultRoot] },
			),
		).toThrow(/denied by sandbox/);
	});
});
