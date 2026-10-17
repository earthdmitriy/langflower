#!/usr/bin/env node
/**
 * Regenerate docs indexes from frontmatter.
 *
 *   node build/docs-gen.mjs --check [--root <repo>]
 *   node build/docs-gen.mjs [--root <repo>]
 *
 * --check writes nothing and exits 1 when the tree would change.
 * When docs/adr or docs/bugs is missing, --check exits 1 with
 * "indexes missing until step 5".
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildPlan,
	diffPlan,
	indexesMissing,
	writePlan,
} from './lib/docs/generate.mjs';

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

if (check && indexesMissing(root)) {
	console.error('indexes missing until step 5');
	process.exit(1);
}

const plan = await buildPlan(root);

if (check) {
	const diffs = diffPlan(root, plan);
	if (diffs.length > 0) {
		for (const line of diffs) {
			console.error(line);
		}
		process.exit(1);
	}
	process.exit(0);
}

writePlan(root, plan);
