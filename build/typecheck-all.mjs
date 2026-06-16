#!/usr/bin/env node
/**
 * Typecheck all workspace packages.
 *
 * Bash: bash build/typecheck-all.sh
 */

import { runMain, runSteps } from './lib/run-step.mjs';
import { BUILD_ORDER } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	const startedAt = Date.now();

	log.title('Langflower — typecheck all packages');

	const steps = BUILD_ORDER.map((pkg) => ({
		name: pkg.name,
		workspace: pkg.name,
		script: 'typecheck',
	}));

	await runSteps(steps);

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(`Typecheck passed for all packages (${seconds}s)`);
});
