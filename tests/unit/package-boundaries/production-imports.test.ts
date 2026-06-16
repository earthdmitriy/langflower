import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	ALLOWED_WORKSPACE_DEPS,
	PACKAGE_DIRS,
	PACKAGE_NPM_NAME,
	toWorkspacePackageName,
	type PackageDir,
	type WorkspacePackageName,
} from './allowed-edges.js';
import {
	collectTsFiles,
	isProductionSource,
	listLangflowerImports,
	readJson,
} from './scan.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

type PackageJson = {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
};

const declaredWorkspaceDeps = (
	dir: PackageDir,
): ReadonlySet<WorkspacePackageName> => {
	const pkg = readJson<PackageJson>(
		path.join(ROOT, 'packages', dir, 'package.json'),
	);
	const merged = {
		...pkg.dependencies,
		...pkg.peerDependencies,
	};
	return new Set(
		Object.keys(merged).filter((name): name is WorkspacePackageName =>
			name.startsWith('@langflower/'),
		),
	);
};

const relPath = (file: string): string =>
	path.relative(ROOT, file).replace(/\\/g, '/');

describe('production @langflower/* imports', () => {
	it('production sources only import packages allowed by the DAG matrix', () => {
		const offenders: string[] = [];

		for (const dir of PACKAGE_DIRS) {
			const allowed = new Set(ALLOWED_WORKSPACE_DEPS[dir]);
			const srcRoot = path.join(ROOT, 'packages', dir, 'src');
			const files = collectTsFiles(srcRoot).filter(isProductionSource);

			for (const file of files) {
				const specs = listLangflowerImports(readFileSync(file, 'utf8'));

				for (const spec of specs) {
					const pkgName = toWorkspacePackageName(spec);
					if (pkgName === null) {
						offenders.push(
							`${relPath(file)}: unknown workspace import ${spec}`,
						);
						continue;
					}
					if (pkgName === PACKAGE_NPM_NAME[dir]) {
						continue;
					}
					if (!allowed.has(pkgName)) {
						offenders.push(
							`${relPath(file)}: imports ${spec} → ${pkgName} (not in ALLOWED for ${dir})`,
						);
					}
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	it('production @langflower/* imports are declared in package.json dependencies', () => {
		const offenders: string[] = [];

		for (const dir of PACKAGE_DIRS) {
			const declared = declaredWorkspaceDeps(dir);
			const srcRoot = path.join(ROOT, 'packages', dir, 'src');
			const files = collectTsFiles(srcRoot).filter(isProductionSource);

			for (const file of files) {
				const specs = listLangflowerImports(readFileSync(file, 'utf8'));

				for (const spec of specs) {
					const pkgName = toWorkspacePackageName(spec);
					if (pkgName === null) {
						continue;
					}
					if (pkgName === PACKAGE_NPM_NAME[dir]) {
						continue;
					}
					if (!declared.has(pkgName)) {
						offenders.push(
							`${relPath(file)}: imports ${spec} → ${pkgName} (missing from ${dir}/package.json dependencies)`,
						);
					}
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
