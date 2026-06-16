#!/usr/bin/env node
/** Build @langflower/shared — bash: bash build/build-shared.sh */

import { runMain } from './lib/run-step.mjs';
import { buildPackage } from './lib/build-package.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	log.title('Build @langflower/shared');
	await buildPackage('shared');
});
