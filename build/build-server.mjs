#!/usr/bin/env node
/** Build @langflower/server — bash: bash build/build-server.sh */

import { runMain } from './lib/run-step.mjs';
import { buildPackage } from './lib/build-package.mjs';
import { log } from './lib/logger.mjs';

await runMain(async () => {
	log.title('Build @langflower/server');
	await buildPackage('server');
});
