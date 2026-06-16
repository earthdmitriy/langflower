/**
 * Build a single workspace package by short key (shared|websocket-bridge|server|ui|cli).
 */

import { log } from './logger.mjs';
import { runStep } from './run-step.mjs';
import { PACKAGES } from './paths.mjs';

const PACKAGE_KEYS = Object.keys(PACKAGES);

function resolvePackage(key) {
	const pkg = PACKAGES[key];

	if (!pkg) {
		log.error(
			`Unknown package "${key}". Available: ${PACKAGE_KEYS.join(', ')}`,
		);
		process.exit(1);
	}

	return pkg;
}

/**
 * @param {string} key — package key from PACKAGES
 * @param {string} script — npm script name (default: build)
 */
export async function buildPackage(key, script = 'build') {
	const pkg = resolvePackage(key);

	await runStep({
		name: pkg.name,
		workspace: pkg.name,
		script,
	});
}
