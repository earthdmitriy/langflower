#!/usr/bin/env node
/**
 * Start the Langflower dev workflow in a single terminal.
 *
 * Steps:
 * 1. Build shared, server, and CLI packages.
 * 2. Clear the stale Angular/Vite dependency-optimizer cache.
 * 3. Start the API server and Angular UI dev server together.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './lib/logger.mjs';
import { PACKAGES } from './lib/paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AGENT_RUN = path.join(ROOT, 'build', 'tools', 'agent-run.mjs');
/** Matches `langflower start --dev ./demo-project` default listen port. */
const DEV_API_PORT = 4010;

/**
 * Fail before build/concurrently when an orphan still holds the API port —
 * otherwise `ng serve` can come up while bind hangs or the old process keeps
 * serving stale code on 4010.
 */
const assertDevApiPortFree = () =>
	new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once('error', (error) => {
			if (error.code === 'EADDRINUSE') {
				reject(
					new Error(`порт занят: 127.0.0.1:${String(DEV_API_PORT)}`),
				);
				return;
			}
			reject(error);
		});
		probe.listen(DEV_API_PORT, '127.0.0.1', () => {
			probe.close((closeError) => {
				if (closeError) {
					reject(closeError);
					return;
				}
				resolve();
			});
		});
	});

/**
 * `ng serve`'s Vite dependency optimizer caches pre-bundled workspace
 * packages (e.g. `@langflower/shared`) on disk, keyed by a hash that does
 * not account for local `dist/` rebuilds. `build-all` just rewrote those
 * `dist/` files, so a leftover cache would keep serving pre-rebuild bundles
 * — silently missing new/changed exports until someone thinks to clear it
 * by hand. Wipe it on every dev start so the optimizer re-bundles from the
 * fresh build.
 */
async function clearViteDepsCache() {
	const cacheDir = path.join(PACKAGES.ui.dir, '.angular', 'cache');
	await fs.rm(cacheDir, { recursive: true, force: true });
	log.success('Cleared stale Angular/Vite dependency cache');
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: ROOT,
			stdio: 'inherit',
			shell: false,
			...options,
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`${command} exited due to signal ${signal}`));
				return;
			}

			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

async function main() {
	await assertDevApiPortFree();
	await runCommand(process.execPath, [AGENT_RUN, 'build-all']);
	await clearViteDepsCache();

	const concurrentlyEntry = path.join(
		ROOT,
		'node_modules',
		'concurrently',
		'dist',
		'bin',
		'index.js',
	);
	const concurrentlyArgs = [
		'--raw',
		'--kill-others-on-fail',
		'--names',
		'server,ui',
		'-c',
		'blue,green',
		'node packages/cli/bin/langflower.js start --dev ./demo-project',
		'npm run start -w @langflower/ui',
	];

	await runCommand(
		process.execPath,
		[concurrentlyEntry, ...concurrentlyArgs],
		{
			env: {
				...process.env,
				NG_CLI_ANALYTICS: 'false',
			},
		},
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
