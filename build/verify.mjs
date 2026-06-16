#!/usr/bin/env node
/**
 * One-shot verification: build all packages, then unit (+ integration by default).
 *
 * Usage:
 *   node build/verify.mjs           # build-all + unit + integration
 *   node build/verify.mjs --quick   # build-all + unit only (faster loop)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/run-step.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';

const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BUILD_DIR, '..');

function runNodeScript(scriptName, args = []) {
	return new Promise((resolve, reject) => {
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
					'verify',
					`${scriptName} failed (exit ${code ?? 1})`,
					{
						exitCode: code ?? 1,
					},
				),
			);
		});
	});
}

const quick = process.argv.includes('--quick');
const skipExports = process.argv.includes('--skip-exports');

await runMain(async () => {
	const startedAt = Date.now();

	log.title(
		quick
			? 'Langflower — verify (build + unit)'
			: 'Langflower — verify (build + unit + integration)',
	);

	await runNodeScript('build-all.mjs');

	if (!skipExports) {
		await runNodeScript('check-exports.mjs');
	}

	await runNodeScript('test.mjs', ['--unit']);

	if (!quick) {
		await runNodeScript('test.mjs', ['--integration']);
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();
	log.success(`Verify passed (${seconds}s)`);
});
