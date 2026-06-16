#!/usr/bin/env node
/**
 * Build one package by workspace key.
 *
 * Usage:
 *   node build/build-package.mjs shared
 *   node build/build-package.mjs ui typecheck
 *   bash build/build-package.sh server
 */

import { runMain } from './lib/run-step.mjs';
import { buildPackage } from './lib/build-package.mjs';

const cliKey = process.argv[2];
const script = process.argv[3] ?? 'build';

if (!cliKey) {
	console.error(
		'Usage: node build/build-package.mjs <shared|runtime|websocketBridge|server|ui|cli> [script]',
	);
	process.exit(1);
}

await runMain(async () => {
	await buildPackage(cliKey, script);
});
