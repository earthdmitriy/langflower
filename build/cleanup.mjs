#!/usr/bin/env node
/**
 * Remove dependency trees and lockfiles for a fresh npm install.
 *
 * Does NOT remove build artifacts — use clean.mjs for dist/.angular cache.
 *
 * Bash: bash build/cleanup.sh
 * With reinstall: bash build/cleanup.sh --install
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { runMain } from './lib/run-step.mjs';
import { PACKAGES, ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';
import { runNpm } from './lib/spawn-npm.mjs';
import { formatCommandError, formatSpawnError } from './lib/format-error.mjs';

const CLEANUP_TARGETS = [
	path.join(ROOT, 'node_modules'),
	path.join(ROOT, 'package-lock.json'),
	path.join(ROOT, '.tools'),
	...Object.values(PACKAGES).map((pkg) => path.join(pkg.dir, 'node_modules')),
];

async function removePath(target) {
	try {
		await fs.rm(target, { recursive: true, force: true });
		log.success(`Removed ${path.relative(ROOT, target)}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new BuildError(
			'cleanup',
			`Failed to remove ${path.relative(ROOT, target)}`,
			{ rawTail: message },
		);
	}
}

async function installDependencies(extraArgs) {
	const args = ['install', ...extraArgs];

	log.blank();
	log.title('Langflower — install dependencies');
	log.step(`npm ${args.join(' ')}`);

	const startedAt = Date.now();

	try {
		await runNpm({
			args,
			cwd: ROOT,
			onStdout: (text) => process.stdout.write(text),
			onStderr: (text) => process.stderr.write(text),
		});
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, 'npm install');
		}

		throw formatCommandError({
			stepName: 'npm install',
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(`Dependencies installed (${seconds}s)`);
}

await runMain(async () => {
	const extraArgs = process.argv.slice(2);
	const shouldInstall = extraArgs.includes('--install');
	const npmArgs = extraArgs.filter((arg) => arg !== '--install');

	log.title('Langflower — cleanup dependencies');

	for (const target of CLEANUP_TARGETS) {
		await removePath(target);
	}

	log.blank();
	log.success('Dependency cleanup complete');

	if (shouldInstall) {
		await installDependencies(npmArgs);
	} else {
		log.info('Run npm install or: npm run cleanup:install');
	}
});
