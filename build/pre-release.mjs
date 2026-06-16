#!/usr/bin/env node
/**
 * Release gate: format → test → build-all → pack-release.
 *
 * Usage (repo root):
 *   1. Bump version in package.json
 *   2. npm run pre-release
 *   3. npm publish --access public
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/run-step.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';
import { withReleaseSourcemapsOff } from './lib/stage-release.mjs';

const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BUILD_DIR, '..');

const runNodeScript = (scriptName, args = []) =>
	new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[path.join(BUILD_DIR, scriptName), ...args],
			{
				cwd: ROOT,
				stdio: 'inherit',
				shell: false,
			},
		);
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve(undefined);
				return;
			}
			reject(
				new BuildError(
					'pre-release',
					`${scriptName} failed (exit ${code ?? 1})`,
					{ exitCode: code ?? 1 },
				),
			);
		});
	});

await runMain(async () => {
	const startedAt = Date.now();
	log.title('Langflower — pre-release');

	log.step('format');
	await runNodeScript('format.mjs');

	log.step('test');
	await runNodeScript('test.mjs');

	log.step('build-all (release: sourcemaps off)');
	await withReleaseSourcemapsOff(async () => {
		await runNodeScript('build-all.mjs');
	});

	log.step('pack-release');
	await runNodeScript('pack-release.mjs', ['--skip-build']);

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(`Pre-release ready (${seconds}s)`);
	log.info('Next (human):');
	log.info('  npm publish --access public');
	log.info(
		'Then restore package.json from .release/package.json.backup (or git checkout).',
	);
});
