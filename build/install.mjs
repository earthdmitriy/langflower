#!/usr/bin/env node
/**
 * Install npm workspace dependencies.
 *
 * Forwards extra args to npm install:
 *   bash build/install.sh --legacy-peer-deps
 *
 * Bash: bash build/install.sh
 */

import { runMain } from './lib/run-step.mjs';
import { ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import { formatCommandError, formatSpawnError } from './lib/format-error.mjs';
import { runNpm } from './lib/spawn-npm.mjs';

await runMain(async () => {
	const extraArgs = process.argv.slice(2);
	const args = ['install', ...extraArgs];

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
});
