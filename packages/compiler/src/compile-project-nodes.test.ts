import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
	compileProjectNodes,
	hasCustomNodePacks,
} from './compile-project-nodes.js';
import { COMPILATION_ERRORS_FILE } from './write-compilation-errors.js';

const execFileAsync = promisify(execFile);

const tempRoots: string[] = [];

const PACK_TSCONFIG = `{
	"compilerOptions": {
		"target": "ES2022",
		"module": "NodeNext",
		"moduleResolution": "NodeNext",
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"types": ["node"]
	},
	"include": ["./**/*.ts"],
	"exclude": ["./**/*.test.ts", "node_modules"]
}
`;

const makeProject = async (): Promise<string> => {
	const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lf-compiler-'));
	tempRoots.push(projectDir);
	await fs.mkdir(path.join(projectDir, '.langflower', 'nodes'), {
		recursive: true,
	});
	return projectDir;
};

const writePack = async (
	projectDir: string,
	packName: string,
	files: Readonly<Record<string, string>>,
	packageJson?: Record<string, unknown>,
	options?: { readonly withTsconfig?: boolean },
): Promise<string> => {
	const packDir = path.join(projectDir, '.langflower', 'nodes', packName);
	await fs.mkdir(packDir, { recursive: true });
	await fs.writeFile(
		path.join(packDir, 'package.json'),
		`${JSON.stringify(
			{
				name: packName,
				version: '0.0.0',
				private: true,
				type: 'module',
				...packageJson,
			},
			null,
			'\t',
		)}\n`,
		'utf8',
	);

	if (options?.withTsconfig === true) {
		await fs.writeFile(
			path.join(packDir, 'tsconfig.json'),
			PACK_TSCONFIG,
			'utf8',
		);
	}

	for (const [relative, source] of Object.entries(files)) {
		const filePath = path.join(packDir, relative);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, source, 'utf8');
	}

	return packDir;
};

const validNode = (
	type: string,
	displayName: string,
): string => `import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: '${type}',
	displayName: '${displayName}',
	category: 'Text',
	uiSchema: [] as const,
	inputs: {
		trigger: { wireType: 'any', required: true, dynamic: true },
	},
	outputs: {
		out: { wireType: 'string' },
	},
	execute() {
		return { out: 'ok' };
	},
});
`;

const VALID_NODE = validNode('fixture-echo', 'Fixture Echo');

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe('compileProjectNodes', () => {
	it('returns empty without cache when nodes/ has no packs', async () => {
		const projectDir = await makeProject();

		expect(await hasCustomNodePacks(projectDir)).toBe(false);

		const result = await compileProjectNodes(projectDir);

		expect(result).toEqual({ nodes: [], errors: [] });
		await expect(
			fs.access(path.join(projectDir, '.langflower', '.cache', 'nodes')),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('compiles defineNode export default without index.ts', async () => {
		const projectDir = await makeProject();
		await writePack(projectDir, 'good-pack', {
			'echo.ts': VALID_NODE,
		});

		const result = await compileProjectNodes(projectDir);

		expect(result.errors).toEqual([]);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0]?.type).toBe('fixture-echo');
	});

	it('writes COMPILATION_ERRORS.md on syntax failure', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(projectDir, 'bad-syntax', {
			'broken.ts': 'export default defineNode({\n',
		});

		const result = await compileProjectNodes(projectDir);

		expect(result.nodes).toEqual([]);
		expect(result.errors[0]?.packageName).toBe('bad-syntax');
		const markdown = await fs.readFile(
			path.join(packDir, COMPILATION_ERRORS_FILE),
			'utf8',
		);

		for (const diagnostic of result.errors[0]?.diagnostics ?? []) {
			expect(markdown).toContain(diagnostic.message);
		}
	});

	it('rejects invalid default shape and writes markdown', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(projectDir, 'bad-shape', {
			'bad.ts': 'export default 42;\n',
		});

		const result = await compileProjectNodes(projectDir);

		expect(result.nodes).toEqual([]);
		expect(
			result.errors[0]?.diagnostics[0]?.file?.replace(/\\/g, '/'),
		).toBe('.langflower/nodes/bad-shape/bad.ts');
		expect(result.errors[0]?.message).toContain('not a node definition');
		const markdown = await fs.readFile(
			path.join(packDir, COMPILATION_ERRORS_FILE),
			'utf8',
		);
		expect(markdown).toContain(result.errors[0]?.message ?? '');
		expect(markdown).not.toContain('Typecheck failed');
	});

	it('fails when author dependency is missing from node_modules', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(
			projectDir,
			'missing-dep',
			{
				'dep.ts': `import { z } from 'zod';
import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-zod',
	displayName: 'Fixture Zod',
	uiSchema: [] as const,
	inputs: { trigger: { wireType: 'any', required: true, dynamic: true } },
	outputs: { out: { wireType: 'string' } },
	execute() {
		return { out: z.string().parse('x') };
	},
});
`,
			},
			{
				dependencies: { zod: '^3.0.0' },
			},
		);

		const result = await compileProjectNodes(projectDir);

		expect(result.nodes).toEqual([]);
		const markdown = await fs.readFile(
			path.join(packDir, COMPILATION_ERRORS_FILE),
			'utf8',
		);
		expect(markdown.length).toBeGreaterThan(0);
		expect(result.errors[0]?.diagnostics.length).toBeGreaterThan(0);
	});

	it('deletes COMPILATION_ERRORS.md after recovery', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(projectDir, 'recover', {
			'node.ts': 'export default 1;\n',
		});

		const failed = await compileProjectNodes(projectDir);
		expect(failed.errors.length).toBeGreaterThan(0);
		await expect(
			fs.access(path.join(packDir, COMPILATION_ERRORS_FILE)),
		).resolves.toBeUndefined();

		await fs.writeFile(path.join(packDir, 'node.ts'), VALID_NODE, 'utf8');
		const ok = await compileProjectNodes(projectDir);
		expect(ok.errors).toEqual([]);
		expect(ok.nodes).toHaveLength(1);

		await expect(
			fs.access(path.join(packDir, COMPILATION_ERRORS_FILE)),
		).rejects.toMatchObject({ code: 'ENOENT' });
	});

	it('bundles an author npm dependency from pack node_modules', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(
			projectDir,
			'with-dep',
			{
				'echo.ts': `import { TAG } from 'tiny-tag';
import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-dep',
	displayName: 'Fixture Dep',
	uiSchema: [] as const,
	inputs: { trigger: { wireType: 'any', required: true, dynamic: true } },
	outputs: { out: { wireType: 'string' } },
	execute() {
		return { out: TAG };
	},
});
`,
			},
			{ dependencies: { 'tiny-tag': '0.0.0' } },
		);

		const depDir = path.join(packDir, 'node_modules', 'tiny-tag');
		await fs.mkdir(depDir, { recursive: true });
		await fs.writeFile(
			path.join(depDir, 'package.json'),
			`${JSON.stringify({ name: 'tiny-tag', version: '0.0.0', type: 'module', main: 'index.js' })}\n`,
			'utf8',
		);
		await fs.writeFile(
			path.join(depDir, 'index.js'),
			"export const TAG = 'bundled-dep';\n",
			'utf8',
		);

		const result = await compileProjectNodes(projectDir);
		expect(result.errors).toEqual([]);
		expect(result.nodes[0]?.type).toBe('fixture-dep');
	});

	it('keeps a good pack when a sibling pack fails', async () => {
		const projectDir = await makeProject();
		await writePack(projectDir, 'good-pack', { 'echo.ts': VALID_NODE });
		const badDir = await writePack(projectDir, 'bad-pack', {
			'bad.ts': 'export default 0;\n',
		});

		const result = await compileProjectNodes(projectDir);

		expect(result.nodes.some((node) => node.type === 'fixture-echo')).toBe(
			true,
		);
		expect(
			result.errors.some((error) => error.packageName === 'bad-pack'),
		).toBe(true);
		await expect(
			fs.access(path.join(badDir, COMPILATION_ERRORS_FILE)),
		).resolves.toBeUndefined();
	});

	it('typechecks peer-only pack without pack node_modules', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(
			projectDir,
			'peers-only',
			{
				'gate.ts': `import { defineReactiveNode } from '@langflower/node-sdk';
import { map } from 'rxjs';

export default defineReactiveNode({
	type: 'fixture-peers',
	displayName: 'Peers Only',
	category: 'Text',
	uiSchema: [] as const,
	bind(_ctx, { makeInput, configureOutput }) {
		const trigger = makeInput<unknown>('trigger', {
			name: 'trigger',
			dynamic: true,
			required: true,
			defaultValue: null,
		});
		const out$ = trigger.pipeValue(map(() => 'ok'));
		return {
			inputs: [trigger],
			outputs: [
				configureOutput('out', out$, { wireType: 'string' }),
			],
		};
	},
});
`,
			},
			{
				peerDependencies: {
					'@langflower/node-sdk': '0.1.0',
					'@rx-evo/stateful-observable': '^0.5.2',
					rxjs: '^7.8.1',
				},
			},
			{ withTsconfig: true },
		);

		await expect(
			fs.access(path.join(packDir, 'node_modules')),
		).rejects.toMatchObject({ code: 'ENOENT' });

		const result = await compileProjectNodes(projectDir);

		expect(result.errors).toEqual([]);
		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0]?.type).toBe('fixture-peers');

		const cachePackDir = path.join(
			projectDir,
			'.langflower',
			'.cache',
			'nodes',
			'peers-only',
		);
		const hashDirs = await fs.readdir(cachePackDir);
		expect(hashDirs.length).toBeGreaterThan(0);
		const artifactDir = path.join(cachePackDir, hashDirs[0] ?? '');
		const artifacts = await fs.readdir(artifactDir);
		const outfileName = artifacts.find((name) => name.endsWith('.mjs'));
		expect(outfileName).toBeDefined();
		const outfile = path.join(artifactDir, outfileName ?? '');
		const bundled = await fs.readFile(outfile, 'utf8');

		expect(bundled).not.toMatch(/from\s+["']@langflower\/node-sdk["']/u);
		expect(bundled).not.toMatch(/from\s+["']rxjs["']/u);
		expect(bundled).toMatch(/from\s+["']file:/u);

		const { stdout } = await execFileAsync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`const mod = await import(${JSON.stringify(pathToFileURL(outfile).href)}); if (mod?.default?.type !== 'fixture-peers') { process.exit(2); } console.log('native-ok');`,
			],
			{ cwd: projectDir },
		);
		expect(stdout.trim()).toBe('native-ok');
	});

	it('typechecks entry files and still compiles sibling entries', async () => {
		const projectDir = await makeProject();
		const packDir = await writePack(
			projectDir,
			'mixed-pack',
			{
				'good.ts': validNode('fixture-good', 'Good'),
				'bad.ts': `import { defineNode } from '@langflower/node-sdk';

export default defineNode({
	type: 'fixture-bad',
	displayName: 'Bad',
	uiSchema: [] as const,
	inputs: { trigger: { wireType: 'any', required: true, dynamic: true } },
	outputs: { out: { wireType: 'string' } },
	execute() {
		return { out: codee };
	},
});
`,
			},
			undefined,
			{ withTsconfig: true },
		);

		const result = await compileProjectNodes(projectDir);

		expect(result.nodes.some((node) => node.type === 'fixture-good')).toBe(
			true,
		);
		expect(result.nodes.some((node) => node.type === 'fixture-bad')).toBe(
			false,
		);
		expect(result.errors.length).toBeGreaterThan(0);
		expect(
			result.errors.some((error) =>
				error.diagnostics.some((diagnostic) =>
					diagnostic.message.includes('codee'),
				),
			),
		).toBe(true);

		const markdown = await fs.readFile(
			path.join(packDir, COMPILATION_ERRORS_FILE),
			'utf8',
		);
		expect(markdown).toContain('codee');
		expect(markdown).toContain('.langflower/nodes/mixed-pack/bad.ts');
		expect(markdown).toContain(result.errors[0]?.message ?? '');
		expect(result.errors[0]?.message).toContain('codee');
		expect(result.errors[0]?.message).not.toContain('Typecheck failed');
	});
});
