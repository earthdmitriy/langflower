#!/usr/bin/env node
/**
 * Run Vitest suites with readable failure output.
 *
 * Usage:
 *   node build/test.mjs              # quiet: prints "ok" or failed list
 *   node build/test.mjs --details    # live Vitest stream
 *   node build/test.mjs --unit
 *   node build/test.mjs --integration
 *   node build/test.mjs --watch
 *   npm run test:details
 *
 * Note: do not use `npm run test --verbose` — npm steals `--verbose` as its
 * own loglevel flag and never forwards it to this script.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMain } from './lib/run-step.mjs';
import { runBin } from './lib/run-bin.mjs';
import { log } from './lib/logger.mjs';
import { formatCommandError, formatSpawnError } from './lib/format-error.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'vitest.config.mjs');

const argv = process.argv.slice(2);
const watch = argv.includes('--watch');
const unitOnly = argv.includes('--unit');
const integrationOnly = argv.includes('--integration');
// `--verbose` is reserved by npm (`npm run test --verbose` → loglevel only).
const details = argv.includes('--details') || process.env.BUILD_VERBOSE === '1';
const passthroughIndex = argv.indexOf('--');
const scriptArgv =
	passthroughIndex === -1 ? argv : argv.slice(0, passthroughIndex);
const passthrough =
	passthroughIndex === -1 ? [] : argv.slice(passthroughIndex + 1);
const filteredArgv = scriptArgv.filter(
	(arg) =>
		arg !== '--unit' &&
		arg !== '--integration' &&
		arg !== '--watch' &&
		arg !== '--details',
);

const quiet = !details && !watch;

function resolveProjects() {
	if (unitOnly) {
		return ['unit'];
	}

	if (integrationOnly) {
		return ['integration'];
	}

	return ['unit', 'integration'];
}

async function runProject(projectName) {
	const subcommand = watch ? 'watch' : 'run';
	const args = [
		subcommand,
		'--project',
		projectName,
		'--config',
		CONFIG,
		...filteredArgv,
		...passthrough,
	];

	if (!quiet) {
		log.step(`vitest ${args.join(' ')}`);
	}

	const startedAt = Date.now();

	try {
		await runBin('vitest', args, { quiet });
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, `vitest:${projectName}`);
		}

		const error = formatCommandError({
			stepName: `vitest:${projectName}`,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});

		if (quiet && error.details?.issues?.length > 0) {
			error.details.rawTail = undefined;
		}

		throw error;
	}

	if (!quiet) {
		const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
		log.success(`vitest:${projectName} — passed (${seconds}s)`);
	}
}

await runMain(async () => {
	const projects = resolveProjects();

	if (!quiet) {
		log.title(
			watch
				? 'Langflower — test (watch)'
				: unitOnly
					? 'Langflower — test (unit)'
					: integrationOnly
						? 'Langflower — test (integration)'
						: 'Langflower — test (all)',
		);
	}

	for (const project of projects) {
		await runProject(project);
	}

	if (quiet) {
		process.stdout.write('ok\n');
		return;
	}

	log.blank();
	log.success('All test suites passed');
});
