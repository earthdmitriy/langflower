/**
 * Changed code whose covers globs match must touch one of those docs,
 * or a commit in the range must carry `Docs: none — <reason>`.
 */

import { spawnSync } from 'node:child_process';
import { formatReminder, makeFinding, type Finding } from '../reminder.js';
import {
	globMatches,
	samePath,
	snapshot,
	type FrontmatterValue,
} from '../scan.js';

export type FreshnessSkip = {
	readonly skipped: true;
	readonly cause: 'not-git' | 'missing-base';
	readonly reason: string;
};

export type FreshnessResult = readonly Finding[] | FreshnessSkip;

export type FreshnessOptions = {
	/** Pins the base ref in fixtures so they do not read process.env. */
	readonly baseRef?: string;
	/**
	 * Pins DOCS_BASE_REF for fixtures. Undefined reads the environment.
	 * Empty string means the variable is unset.
	 */
	readonly envBase?: string;
};

const GUIDE = 'docs/guides/writing-docs.md';

const TRAILER = /^Docs: none \u2014 \S/m;

const git = (
	root: string,
	args: readonly string[],
): { readonly status: number; readonly stdout: string } | null => {
	const result = spawnSync('git', ['-C', root, ...args], {
		encoding: 'utf8',
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) {
		return null;
	}
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
	};
};

const isGitRoot = (root: string): boolean => {
	const top = git(root, ['rev-parse', '--show-toplevel']);
	if (top === null || top.status !== 0) {
		return false;
	}
	return samePath(top.stdout.trim(), root);
};

const refExists = (root: string, ref: string): boolean => {
	const verified = git(root, [
		'rev-parse',
		'--verify',
		'--quiet',
		`${ref}^{commit}`,
	]);
	return verified !== null && verified.status === 0;
};

/**
 * DOCS_BASE_REF, else origin/main, else origin/master, else null.
 * An explicit baseRef or a non-empty env pin is used as written, even when
 * that ref is missing (the caller then skips).
 */
const resolveBase = (
	root: string,
	options?: FreshnessOptions,
): string | null => {
	const pinned = options?.baseRef?.trim() ?? '';
	if (pinned !== '') {
		return pinned;
	}
	const fromEnv =
		options?.envBase !== undefined
			? options.envBase.trim()
			: (process.env.DOCS_BASE_REF?.trim() ?? '');
	if (fromEnv !== '') {
		return fromEnv;
	}
	for (const candidate of ['origin/main', 'origin/master']) {
		if (refExists(root, candidate)) {
			return candidate;
		}
	}
	return null;
};

const parsePorcelainPath = (line: string): string | null => {
	if (line.length < 4) {
		return null;
	}
	let rest = line.slice(3).trim();
	if (rest.includes(' -> ')) {
		rest = rest.split(' -> ').pop() ?? rest;
	}
	if (rest.startsWith('"') && rest.endsWith('"')) {
		rest = rest.slice(1, -1);
	}
	const rel = rest.replace(/\\/g, '/');
	return rel.length > 0 ? rel : null;
};

const changedFiles = (root: string, base: string): readonly string[] => {
	const diff = git(root, ['diff', '--name-only', `${base}...HEAD`]);
	const status = git(root, ['status', '--porcelain']);
	const names = new Set<string>();
	if (diff !== null && diff.status === 0) {
		for (const line of diff.stdout.split(/\r?\n/)) {
			const rel = line.trim().replace(/\\/g, '/');
			if (rel.length > 0) {
				names.add(rel);
			}
		}
	}
	if (status !== null && status.status === 0) {
		for (const line of status.stdout.split(/\r?\n/)) {
			if (line.trim() === '') {
				continue;
			}
			const rel = parsePorcelainPath(line);
			if (rel !== null) {
				names.add(rel);
			}
		}
	}
	return [...names];
};

const hasTrailer = (root: string, base: string): boolean => {
	const log = git(root, ['log', `${base}..HEAD`, '--format=%B']);
	if (log === null || log.status !== 0) {
		return false;
	}
	return TRAILER.test(log.stdout);
};

const isAllowListed = (rel: string): boolean => {
	if (rel === 'docs' || rel.startsWith('docs/')) {
		return true;
	}
	if (
		rel === 'tests' ||
		rel.startsWith('tests/') ||
		rel.includes('/tests/')
	) {
		return true;
	}
	if (
		rel.endsWith('.test.ts') ||
		rel.endsWith('.test.tsx') ||
		rel.endsWith('.test.mjs')
	) {
		return true;
	}
	if (rel.startsWith('fixtures/') || rel.includes('/fixtures/')) {
		return true;
	}
	if (
		rel.endsWith('package-lock.json') ||
		rel.endsWith('pnpm-lock.yaml') ||
		rel.endsWith('yarn.lock') ||
		rel.endsWith('Cargo.lock')
	) {
		return true;
	}
	if (rel === 'dist' || rel.startsWith('dist/') || rel.includes('/dist/')) {
		return true;
	}
	if (rel.includes('/generated/') || rel.endsWith('.generated.ts')) {
		return true;
	}
	return false;
};

const coversOf = (
	data: Readonly<Record<string, FrontmatterValue>>,
): readonly string[] => {
	const covers = data.covers;
	if (!Array.isArray(covers)) {
		return [];
	}
	return covers;
};

export const checkFreshness = (
	root: string,
	options?: FreshnessOptions,
): FreshnessResult => {
	if (!isGitRoot(root)) {
		return {
			skipped: true,
			cause: 'not-git',
			reason: 'Not a git repository; freshness skipped.',
		};
	}
	const base = resolveBase(root, options);
	if (base === null) {
		return {
			skipped: true,
			cause: 'missing-base',
			reason: 'No base ref resolved. Set DOCS_BASE_REF (origin/main and origin/master were absent).',
		};
	}
	const verified = git(root, [
		'rev-parse',
		'--verify',
		'--quiet',
		`${base}^{commit}`,
	]);
	if (verified === null || verified.status !== 0) {
		return {
			skipped: true,
			cause: 'missing-base',
			reason: `Base ref ${base} is missing. Set DOCS_BASE_REF.`,
		};
	}
	if (hasTrailer(root, base)) {
		return [];
	}
	const changed = new Set(changedFiles(root, base));
	const snap = snapshot(root);
	const covering = snap.markdown.filter((file) => {
		if (!file.frontmatter.ok || file.generated) {
			return false;
		}
		if (file.path.startsWith('docs/_archive/')) {
			return false;
		}
		return coversOf(file.frontmatter.data).length > 0;
	});
	const findings: Finding[] = [];
	for (const rel of changed) {
		if (isAllowListed(rel)) {
			continue;
		}
		const docs = covering.filter((file) =>
			coversOf(file.frontmatter.ok ? file.frontmatter.data : {}).some(
				(glob) => globMatches(glob, rel),
			),
		);
		if (docs.length === 0) {
			continue;
		}
		const touched = docs.some((file) => changed.has(file.path));
		if (touched) {
			continue;
		}
		findings.push(
			makeFinding(
				'freshness',
				rel,
				docs.map((file) => file.path),
				[
					'Update the doc(s) above in this change.',
					'If behaviour and contracts are unchanged, add to the commit message:\n     Docs: none — <reason>',
				],
				'changed',
			),
		);
	}
	return findings;
};

export const isFreshnessSkip = (
	result: FreshnessResult,
): result is FreshnessSkip => !Array.isArray(result);

export const freshnessMessages = (
	result: FreshnessResult,
	ci: boolean,
): { readonly messages: readonly string[]; readonly notice: string | null } => {
	if (isFreshnessSkip(result)) {
		if (ci && result.cause === 'missing-base') {
			return {
				messages: [
					formatReminder(
						makeFinding(
							'freshness',
							result.reason,
							[GUIDE],
							[
								'Set DOCS_BASE_REF to the base git ref (for example origin/main or origin/master) and rerun the unit tests.',
							],
						),
					),
				],
				notice: null,
			};
		}
		return { messages: [], notice: result.reason };
	}
	return {
		messages: result.map((finding) => formatReminder(finding)),
		notice: null,
	};
};
