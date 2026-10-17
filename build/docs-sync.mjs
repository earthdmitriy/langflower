#!/usr/bin/env node
/**
 * Compare or copy skeleton skills onto the dogfood trees.
 *
 *   node build/docs-sync.mjs --check [--root <repo>]
 *   node build/docs-sync.mjs [--root <repo>]
 *
 * --check writes nothing and exits 1 on any byte drift.
 * Write mode copies packages/server/skeleton/skills/** onto
 * demo-project/.langflower/skills/** and .langflower/skills/**.
 * Run write mode only after the user confirms those copies may
 * be overwritten.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillDrifts, syncSkills } from './lib/docs/skill-sync.mjs';

const defaultRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const rootFlag = argv.indexOf('--root');
const root =
	rootFlag === -1 ? defaultRoot : path.resolve(argv[rootFlag + 1] ?? '');

if (rootFlag !== -1 && (argv[rootFlag + 1] ?? '') === '') {
	console.error('--root requires a path');
	process.exit(1);
}

if (check) {
	const drifts = skillDrifts(root);
	if (drifts.length > 0) {
		for (const drift of drifts) {
			console.error(`${drift.message}: ${drift.path}`);
		}
		process.exit(1);
	}
	process.exit(0);
}

syncSkills(root);
