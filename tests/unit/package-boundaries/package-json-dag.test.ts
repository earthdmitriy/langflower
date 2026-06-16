import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	ALLOWED_WORKSPACE_DEPS,
	PACKAGE_DIRS,
	PACKAGE_NPM_NAME,
	type WorkspacePackageName,
} from './allowed-edges.js';
import { readJson } from './scan.js';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

type PackageJson = {
	readonly name?: string;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
};

const workspaceDepsOf = (pkg: PackageJson): readonly WorkspacePackageName[] => {
	const merged = {
		...pkg.dependencies,
		...pkg.peerDependencies,
	};
	return Object.keys(merged)
		.filter((name): name is WorkspacePackageName =>
			name.startsWith('@langflower/'),
		)
		.sort();
};

describe('package.json workspace DAG', () => {
	it('every packages/*/package.json workspace dep is ⊆ ALLOWED_WORKSPACE_DEPS', () => {
		const offenders: string[] = [];

		for (const dir of PACKAGE_DIRS) {
			const pkgPath = path.join(ROOT, 'packages', dir, 'package.json');
			const pkg = readJson<PackageJson>(pkgPath);
			const allowed = new Set(ALLOWED_WORKSPACE_DEPS[dir]);
			const actual = workspaceDepsOf(pkg);

			for (const dep of actual) {
				if (!allowed.has(dep)) {
					offenders.push(
						`${dir}: package.json depends on ${dep} (not in ALLOWED)`,
					);
				}
			}

			const expectedName = PACKAGE_NPM_NAME[dir];
			if (pkg.name !== expectedName) {
				offenders.push(
					`${dir}: package.json name is ${pkg.name ?? '(missing)'}, expected ${expectedName}`,
				);
			}
		}

		expect(offenders).toEqual([]);
	});

	it('ALLOWED matrix packages exist on disk', () => {
		const missing: string[] = [];
		for (const dir of PACKAGE_DIRS) {
			const pkgPath = path.join(ROOT, 'packages', dir, 'package.json');
			try {
				readJson<PackageJson>(pkgPath);
			} catch {
				missing.push(dir);
			}
		}
		expect(missing).toEqual([]);
	});
});
