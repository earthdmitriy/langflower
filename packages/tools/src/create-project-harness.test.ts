import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProjectHarness } from './create-project-harness.js';
import type { PermissionConfig } from './permission.js';

const allowAllPermission: PermissionConfig = {
	read: { '*': 'allow' },
	glob: { '*': 'allow' },
	grep: { '*': 'allow' },
	edit: { '*': 'allow' },
	write: { '*': 'allow' },
	create: { '*': 'allow' },
	delete: { '*': 'allow' },
	bash: { '*': 'allow' },
};

describe('createProjectHarness', () => {
	let projectRoot: string;

	beforeEach(async () => {
		projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-tools-'));
	});

	afterEach(async () => {
		await fs.rm(projectRoot, { recursive: true, force: true });
	});

	it('create fails when target exists; write overwrites', async () => {
		const harness = createProjectHarness({
			projectRoot,
			permission: allowAllPermission,
		});
		const created = await harness.invoke({
			toolId: 'create',
			args: { path: 'notes.txt', content: 'v1' },
		});
		expect(created.ok).toBe(true);

		const again = await harness.invoke({
			toolId: 'create',
			args: { path: 'notes.txt', content: 'v2' },
		});
		expect(again.ok).toBe(false);
		expect(again.text).toMatch(/already exists/i);

		const written = await harness.invoke({
			toolId: 'write',
			args: { path: 'notes.txt', content: 'v2' },
		});
		expect(written.ok).toBe(true);
		expect(
			await fs.readFile(path.join(projectRoot, 'notes.txt'), 'utf8'),
		).toBe('v2');
	});

	it('denies path escape outside project root', async () => {
		const harness = createProjectHarness({
			projectRoot,
			permission: allowAllPermission,
		});
		const result = await harness.invoke({
			toolId: 'read',
			args: { path: '../outside.txt' },
		});
		expect(result.ok).toBe(false);
		expect(result.text).toMatch(/escapes project root/i);
	});

	it('writes into an allowlisted vault outside the project', async () => {
		const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-vault-'));
		try {
			const harness = createProjectHarness({
				projectRoot,
				allowedRoots: [vaultRoot],
				permission: allowAllPermission,
			});
			const notePath = path.join(vaultRoot, 'Inbox', 'atom.md');
			const written = await harness.invoke({
				toolId: 'write',
				args: {
					path: notePath,
					content: '---\ntitle: Atom\n---\n\nSee [[MOC]].\n',
				},
			});
			expect(written.ok).toBe(true);
			expect(await fs.readFile(notePath, 'utf8')).toContain('[[MOC]]');

			const listed = await harness.invoke({
				toolId: 'glob',
				args: { pattern: '**/*.md', cwd: vaultRoot },
			});
			expect(listed.ok).toBe(true);
			expect(listed.text.replace(/\\/g, '/')).toContain('atom.md');
		} finally {
			await fs.rm(vaultRoot, { recursive: true, force: true });
		}
	});

	it('applies read-class postProcess on success', async () => {
		await fs.writeFile(
			path.join(projectRoot, 'a.txt'),
			'hello world',
			'utf8',
		);
		const harness = createProjectHarness({
			projectRoot,
			permission: allowAllPermission,
		});
		const result = await harness.invoke({
			toolId: 'read',
			args: {
				path: 'a.txt',
				postProcess: '(res) => res.toUpperCase()',
			},
		});
		expect(result.ok).toBe(true);
		expect(result.text).toBe('HELLO WORLD');
	});

	it('fails closed when postProcess throws', async () => {
		await fs.writeFile(path.join(projectRoot, 'a.txt'), 'hello', 'utf8');
		const harness = createProjectHarness({
			projectRoot,
			permission: allowAllPermission,
		});
		const result = await harness.invoke({
			toolId: 'read',
			args: {
				path: 'a.txt',
				postProcess: '(res) => { throw new Error("boom"); }',
			},
		});
		expect(result.ok).toBe(false);
		expect(result.text).toMatch(/postProcess failed/i);
		expect(result.text).not.toBe('hello');
	});

	it('bash is allowed by default permission policy', async () => {
		const harness = createProjectHarness({
			projectRoot,
			bashEnabled: true,
		});
		const result = await harness.invoke({
			toolId: 'bash',
			args: { command: 'echo hi' },
		});
		expect(result.ok).toBe(true);
		expect(result.text).toMatch(/hi/);
	});

	it('bash can be denied by project permission', async () => {
		const harness = createProjectHarness({
			projectRoot,
			bashEnabled: true,
			permission: { bash: 'deny' },
		});
		const result = await harness.invoke({
			toolId: 'bash',
			args: { command: 'echo hi' },
		});
		expect(result.ok).toBe(false);
		expect(result.text).toMatch(/Permission denied/i);
	});

	it('write asks then allow completes; deny fails closed', async () => {
		const asks: string[] = [];
		let nextReply: 'allow' | 'deny' = 'deny';
		const harness = createProjectHarness({
			projectRoot,
			permission: { write: { '*': 'ask' } },
			requestPermission: async (req) => {
				asks.push(req.summary);
				return nextReply;
			},
		});

		const denied = await harness.invoke({
			toolId: 'write',
			args: { path: 'a.txt', content: 'nope' },
		});
		expect(denied.ok).toBe(false);
		expect(denied.text).toMatch(/Permission denied/i);
		expect(asks).toHaveLength(1);
		await expect(
			fs.readFile(path.join(projectRoot, 'a.txt'), 'utf8'),
		).rejects.toThrow();

		nextReply = 'allow';
		const allowed = await harness.invoke({
			toolId: 'write',
			args: { path: 'a.txt', content: 'yes' },
		});
		expect(allowed.ok).toBe(true);
		expect(asks).toHaveLength(2);
		expect(await fs.readFile(path.join(projectRoot, 'a.txt'), 'utf8')).toBe(
			'yes',
		);

		// Run-scoped grant: second write same path skips ask.
		const again = await harness.invoke({
			toolId: 'write',
			args: { path: 'a.txt', content: 'again' },
		});
		expect(again.ok).toBe(true);
		expect(asks).toHaveLength(2);
	});

	it('lists all eight builtin registrations', () => {
		const harness = createProjectHarness({ projectRoot });
		const ids = harness.listBuiltinRegistrations().map((r) => r.toolId);
		expect(ids).toEqual([
			'read',
			'glob',
			'grep',
			'edit',
			'write',
			'create',
			'delete',
			'bash',
		]);
	});
});
