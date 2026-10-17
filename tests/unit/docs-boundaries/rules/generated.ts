/**
 * Spawn docs-gen and docs-sync in --check mode.
 * Write mode of docs-sync is never invoked from here.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFinding, type Finding } from '../reminder.js';

const RULES_DIR = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(RULES_DIR, '../../../../build');

const GUIDE = 'docs/guides/writing-docs.md';

const runCheck = (
	scriptName: string,
	root: string,
): { readonly status: number; readonly detail: string } => {
	const script = path.join(BUILD_DIR, scriptName);
	const result = spawnSync(
		process.execPath,
		[script, '--check', '--root', root],
		{
			encoding: 'utf8',
			windowsHide: true,
			cwd: root,
		},
	);
	const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
	if (result.error) {
		return {
			status: 1,
			detail: result.error.message,
		};
	}
	return {
		status: result.status ?? 1,
		detail: detail === '' ? `${scriptName} --check failed` : detail,
	};
};

export const checkGenerated = (root: string): readonly Finding[] => {
	const run = runCheck('docs-gen.mjs', root);
	if (run.status === 0) {
		return [];
	}
	const first = run.detail.split(/\r?\n/)[0] ?? 'docs-gen --check failed';
	return [
		makeFinding(
			'generated',
			first,
			[
				'docs/adr/README.md',
				'docs/bugs/README.md',
				'docs/architecture/DOC_MAP.md',
				'docs/README.md',
			],
			[
				'Run `node build/tools/agent-run.mjs docs-gen` to regenerate the indexes. Do not edit generated files by hand. Indexes are missing until step 5 if adr/ and bugs/ do not exist yet.',
			],
		),
	];
};

export const checkSync = (root: string): readonly Finding[] => {
	const run = runCheck('docs-sync.mjs', root);
	if (run.status === 0) {
		return [];
	}
	const first = run.detail.split(/\r?\n/)[0] ?? 'docs-sync --check failed';
	const skeleton =
		'packages/server/skeleton/skills/langflower-helper/layout.md';
	return [
		makeFinding(
			'sync',
			first,
			[skeleton, GUIDE],
			[
				'Run `node build/tools/agent-run.mjs docs-sync` ONLY after the user confirms dirty .langflower and demo-project copies may be overwritten.',
			],
		),
	];
};
