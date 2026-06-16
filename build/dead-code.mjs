#!/usr/bin/env node
/**
 * Report dead code in the monorepo (knip: unused files, exports, types).
 *
 * Usage:
 *   node build/dead-code.mjs              # packages/** only, exit 1 if found
 *   node build/dead-code.mjs --json       # machine-readable list
 *   node build/dead-code.mjs --scope repo # include build/, tests/, etc.
 *   node build/dead-code.mjs --kind file  # filter by kind (file|export|type)
 */

import { runMain } from './lib/run-step.mjs';
import { log } from './lib/logger.mjs';
import { BuildError } from './lib/format-error.mjs';
import {
	extractDeadCodeItems,
	formatDeadCodeLine,
	KNIP_INCLUDE_DEAD_CODE,
	parseKnipReport,
	runKnip,
	summarizeDeadCode,
} from './lib/knip-run.mjs';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const scope = args.includes('--scope') ? readFlagValue('--scope') : 'packages';
const kindFilter = readKindFilter();

function readFlagValue(flag) {
	const index = args.indexOf(flag);
	if (index === -1) {
		return null;
	}

	return args[index + 1] ?? null;
}

function readKindFilter() {
	const raw = readFlagValue('--kind');
	if (!raw) {
		return new Set(['file', 'export', 'type']);
	}

	const kinds = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

	const allowed = new Set(['file', 'export', 'type']);
	const selected = kinds.filter((kind) => allowed.has(kind));

	if (selected.length === 0) {
		throw new BuildError(
			'dead-code',
			'--kind must include one of: file, export, type',
			{ exitCode: 1 },
		);
	}

	return new Set(selected);
}

if (scope !== 'packages' && scope !== 'repo') {
	throw new BuildError(
		'dead-code',
		'--scope must be "packages" (default) or "repo"',
		{ exitCode: 1 },
	);
}

await runMain(async () => {
	if (!jsonMode) {
		log.title('Langflower — dead code (knip)');
		log.step('Running knip...');
	}

	const { stdout, stderr, exitCode } = await runKnip({
		include: KNIP_INCLUDE_DEAD_CODE,
	});

	if (exitCode !== 0 && exitCode !== 1) {
		if (!jsonMode) {
			log.error('knip failed to run');
			if (stderr) {
				log.info(stderr);
			}
		}
		throw new BuildError('dead-code', 'knip execution failed', {
			exitCode,
		});
	}

	const report = parseKnipReport(stdout);

	if (!report) {
		if (!jsonMode) {
			log.error('Failed to parse knip output');
			if (stdout) {
				log.info(stdout.substring(0, 500));
			}
		}
		throw new BuildError('dead-code', 'knip output parse failed', {});
	}

	const items = extractDeadCodeItems(report, {
		scope,
		kinds: kindFilter,
	});
	const summary = summarizeDeadCode(items);

	if (jsonMode) {
		process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
		if (summary.total > 0) {
			process.exit(1);
		}
		return;
	}

	if (summary.total === 0) {
		log.success('No dead code found');
		return;
	}

	log.blank();
	log.error(`Found ${summary.total} dead-code item(s):`);
	log.blank();

	for (const item of summary.items) {
		console.log(`  ${formatDeadCodeLine(item)}`);
	}

	log.blank();
	log.info(
		'Kinds: file = unreachable module, export = orphan export, type = unused exported type',
	);
	log.info('Delete dead code — do not only remove export keywords.');
	log.info(
		'Scope: packages/** only (pass --scope repo to include build/ and tests/)',
	);

	throw new BuildError(
		'dead-code',
		`${summary.total} dead-code item(s) found`,
		{ exitCode: 1 },
	);
});
