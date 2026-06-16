#!/usr/bin/env node
/**
 * Lint repository with ESLint.
 *
 * Usage:
 *   node build/lint.mjs
 *   node build/lint.mjs --fix
 */

import { runMain } from './lib/run-step.mjs';
import { runBin } from './lib/run-bin.mjs';
import { log } from './lib/logger.mjs';
import { formatCommandError, formatSpawnError } from './lib/format-error.mjs';

const fix = process.argv.includes('--fix');

await runMain(async () => {
	const args = fix ? ['.', '--fix'] : ['.'];

	log.title(
		fix ? 'Langflower — lint fix (ESLint)' : 'Langflower — lint (ESLint)',
	);

	log.step(`eslint ${args.join(' ')}`);

	const startedAt = Date.now();

	try {
		await runBin('eslint', args);
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, 'eslint');
		}

		throw formatCommandError({
			stepName: 'eslint',
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(
		fix ? `Lint fix complete (${seconds}s)` : `Lint passed (${seconds}s)`,
	);
});
