#!/usr/bin/env node
/**
 * Remove build artifacts from all packages.
 *
 * Bash: bash build/clean.sh
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { runMain } from './lib/run-step.mjs';
import { PACKAGES, ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';

const CLEAN_TARGETS = [
	...Object.values(PACKAGES).map((pkg) => path.join(pkg.dir, 'dist')),
	path.join(PACKAGES.ui.dir, '.angular'),
	path.join(ROOT, 'node_modules/.cache'),
	path.join(ROOT, 'coverage'),
	path.join(ROOT, 'tests/tests/tmp'),
	path.join(ROOT, 'demo-project/.langflower/.cache'),
	path.join(ROOT, 'demo-project/.langflower/nodes/.cache'),
];

async function removePath(target) {
	try {
		await fs.rm(target, { recursive: true, force: true });
		log.success(`Removed ${path.relative(ROOT, target)}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new BuildError(
			'clean',
			`Failed to remove ${path.relative(ROOT, target)}`,
			{ rawTail: message },
		);
	}
}

async function cleanTestsTmp() {
	const testsTmpDir = path.join(ROOT, 'tests/tmp');

	try {
		const entries = await fs.readdir(testsTmpDir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name === '.gitignore') {
				continue;
			}

			await fs.rm(path.join(testsTmpDir, entry.name), {
				recursive: true,
				force: true,
			});
		}

		log.success('Removed tests/tmp/* (kept .gitignore)');
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return;
		}

		const message = error instanceof Error ? error.message : String(error);
		throw new BuildError('clean', 'Failed to clean tests/tmp', {
			rawTail: message,
		});
	}
}

async function cleanTsBuildInfo() {
	const packagesDir = path.join(ROOT, 'packages');
	const entries = await fs.readdir(packagesDir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) {
			continue;
		}

		const infoPath = path.join(
			packagesDir,
			entry.name,
			'tsconfig.tsbuildinfo',
		);

		try {
			await fs.rm(infoPath, { force: true });
		} catch {
			// Missing tsbuildinfo is fine.
		}
	}
}

await runMain(async () => {
	log.title('Langflower — clean build artifacts');

	for (const target of CLEAN_TARGETS) {
		await removePath(target);
	}

	await cleanTestsTmp();
	await cleanTsBuildInfo();
	log.blank();
	log.success('Clean complete');
});
