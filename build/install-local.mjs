#!/usr/bin/env node
/**
 * Build the monorepo and install a stable global `langflower` snapshot.
 *
 * Usage (repo root):
 *   npm run install-local
 *
 * Then from any project directory:
 *   npx langflower
 *   langflower
 *
 * Re-run to refresh the snapshot after rebuilding.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import { runMain } from './lib/run-step.mjs';
import {
	assembleProduct,
	buildAllIfNeeded,
	buildPublishPackageJson,
	runCommand,
} from './lib/stage-release.mjs';

const STAGE_DIR = path.join(ROOT, '.local-install');
const PRODUCT_DIR = path.join(STAGE_DIR, 'langflower');

await runMain(async () => {
	log.title('Langflower — install-local (global snapshot)');

	await buildAllIfNeeded({ build: true });

	log.step(`Preparing stage at ${PRODUCT_DIR}`);
	await fs.rm(STAGE_DIR, { recursive: true, force: true });
	await fs.mkdir(PRODUCT_DIR, { recursive: true });

	const publishPkg = await buildPublishPackageJson();
	await assembleProduct(PRODUCT_DIR, {
		writePackageJson: true,
		packageJson: publishPkg,
	});

	// --install-links packs file: deps into a real copy (not a symlink to stage).
	log.step(`npm install -g --install-links ${PRODUCT_DIR}`);
	await runCommand('npm', ['install', '-g', '--install-links', PRODUCT_DIR]);

	log.blank();
	log.success('Global langflower snapshot installed.');
	log.info('From any project directory:');
	log.info('  npx langflower');
	log.info('  langflower');
	log.info('Optional: langflower [project-dir]  |  langflower start');
	log.info('Re-run `npm run install-local` to refresh the snapshot.');
	log.warn(
		'If a monorepo `npm run dev` is also running, use different ports (default 4010).',
	);
});
