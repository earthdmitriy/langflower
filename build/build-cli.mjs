#!/usr/bin/env node
/** Build langflower CLI — bash: bash build/build-cli.sh */

import { runMain } from './lib/run-step.mjs';
import { buildPackage } from './lib/build-package.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	log.title('Build langflower CLI');
	await buildPackage('cli');
});
