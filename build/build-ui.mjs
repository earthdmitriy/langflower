#!/usr/bin/env node
/** Build @langflower/ui — bash: bash build/build-ui.sh */

import { runMain } from './lib/run-step.mjs';
import { buildPackage } from './lib/build-package.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	log.title('Build @langflower/ui');
	await buildPackage('ui');
});
