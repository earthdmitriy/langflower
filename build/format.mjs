#!/usr/bin/env node
/**
 * Format repository files with Prettier.
 *
 * Usage:
 *   node build/format.mjs          # write
 *   node build/format.mjs --check  # check only
 */

import { runMain } from './lib/run-step.mjs';
import { runBin } from './lib/run-bin.mjs';
import { log } from './lib/logger.mjs';
import { formatCommandError, formatSpawnError } from './lib/format-error.mjs';

const checkOnly = process.argv.includes('--check');

await runMain(async () => {
	const args = checkOnly ? ['--check', '.'] : ['--write', '.'];

	log.title(
		checkOnly
			? 'Langflower — format check (Prettier)'
			: 'Langflower — format (Prettier)',
	);

	log.step(`prettier ${args.join(' ')}`);

	const startedAt = Date.now();

	try {
		await runBin('prettier', args);
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, 'prettier');
		}

		throw formatCommandError({
			stepName: 'prettier',
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(
		checkOnly
			? `Format check passed (${seconds}s)`
			: `All files formatted (${seconds}s)`,
	);
});
