#!/usr/bin/env node
/**
 * Build all monorepo packages in dependency order.
 *
 * Node entrypoint — also callable via bash:
 *   bash build/build-all.sh
 *   npm run build
 */

import { runMain, runSteps } from './lib/run-step.mjs';
import { BUILD_ORDER } from './lib/paths.mjs';
import { logPublishSnapshotSize } from './lib/format-bundle-size.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	const startedAt = Date.now();

	log.title('Langflower — full build');

	const steps = BUILD_ORDER.map((pkg) => ({
		name: pkg.name,
		workspace: pkg.name,
		script: 'build',
	}));

	await runSteps(steps);

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(`All packages built successfully (${seconds}s)`);
	await logPublishSnapshotSize();
});
