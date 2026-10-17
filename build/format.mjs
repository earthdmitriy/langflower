#!/usr/bin/env node
/**
 * Format repository files with Prettier.
 *
 * Usage:
 *   node build/format.mjs                 # write changed files
 *   node build/format.mjs --check         # check changed files
 *   node build/format.mjs --all           # write every file
 *   node build/format.mjs --all --check   # check every file
 *
 * Changed files are staged, unstaged, and untracked (not gitignored).
 * `npm run format --all` sets npm_config_all instead of forwarding --all.
 */

import { spawnSync } from 'node:child_process';
import { runMain } from './lib/run-step.mjs';
import { runBin } from './lib/run-bin.mjs';
import { ROOT } from './lib/paths.mjs';
import { log } from './lib/logger.mjs';
import {
	BuildError,
	formatCommandError,
	formatSpawnError,
} from './lib/format-error.mjs';

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const formatAll =
	argv.includes('--all') || process.env.npm_config_all === 'true';

const COMMAND_LIMIT = 6000;

const gitPaths = (args) => {
	const result = spawnSync('git', args, {
		cwd: ROOT,
		encoding: 'utf8',
	});

	if (result.error) {
		throw new BuildError(
			'prettier',
			`git failed: ${result.error.message}`,
			{ hint: 'Run npm run format --all to format the whole tree.' },
		);
	}

	if ((result.status ?? 1) !== 0) {
		const detail = (result.stderr || result.stdout || '').trim();
		throw new BuildError(
			'prettier',
			detail || `git ${args.join(' ')} failed`,
			{ hint: 'Run npm run format --all to format the whole tree.' },
		);
	}

	return result.stdout.split('\0').filter(Boolean);
};

const listChangedFiles = () => {
	const names = new Set([
		...gitPaths(['diff', '--name-only', '-z', '--diff-filter=ACMR']),
		...gitPaths([
			'diff',
			'--name-only',
			'-z',
			'--cached',
			'--diff-filter=ACMR',
		]),
		...gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
	]);

	return [...names].sort();
};

const shellArg = (value) =>
	/[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;

const chunkArgs = (prefix, files) => {
	const chunks = [];
	let current = [...prefix];
	let length = current.join(' ').length;

	for (const file of files) {
		const arg = shellArg(file);
		const nextLength = length + arg.length + 1;

		if (nextLength > COMMAND_LIMIT && current.length > prefix.length) {
			chunks.push(current);
			current = [...prefix, arg];
			length = current.join(' ').length;
			continue;
		}

		current.push(arg);
		length = nextLength;
	}

	if (current.length > prefix.length) {
		chunks.push(current);
	}

	return chunks;
};

const runPrettier = async (args) => {
	try {
		await runBin('prettier', args);
	} catch (result) {
		if (result.error) {
			throw formatSpawnError(result.error, 'prettier');
		}

		throw formatCommandError({
			stepName: 'prettier',
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			exitCode: result.exitCode ?? 1,
		});
	}
};

await runMain(async () => {
	const mode = checkOnly ? '--check' : '--write';

	log.title(
		checkOnly
			? 'Langflower — format check (Prettier)'
			: 'Langflower — format (Prettier)',
	);

	const startedAt = Date.now();

	if (formatAll) {
		const args = [mode, '.'];
		log.step(`prettier ${args.join(' ')}`);
		await runPrettier(args);
	} else {
		const files = listChangedFiles();

		if (files.length === 0) {
			log.success('No changed files to format');
			return;
		}

		const preview =
			files.length <= 8
				? files.join(' ')
				: `${files.length} changed files`;
		log.step(`prettier ${mode} --ignore-unknown ${preview}`);

		for (const file of files) {
			log.info(file);
		}

		const chunks = chunkArgs([mode, '--ignore-unknown'], files);
		for (const args of chunks) {
			await runPrettier(args);
		}
	}

	const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
	log.blank();

	if (checkOnly) {
		log.success(
			formatAll
				? `Format check passed (${seconds}s)`
				: `Format check passed for changed files (${seconds}s)`,
		);
		return;
	}

	log.success(
		formatAll
			? `All files formatted (${seconds}s)`
			: `Changed files formatted (${seconds}s)`,
	);
});
