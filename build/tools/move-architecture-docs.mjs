/**
 * One-off codemod: move core architecture docs into docs/architecture/ and
 * rewrite every reference across the repo. Delete after the move lands.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Docs that live in docs/architecture/ after this move. */
const MOVED_NAMES = [
	'EXECUTION_ARCHITECTURE',
	'ARCHITECTURE',
	'PRINCIPLES',
	'REACTIVITY',
	'NAVIGATION',
	'EXTENSION_POINT',
	'ADR',
];

const MOVED_OLD_PATHS = new Set(MOVED_NAMES.map((name) => `docs/${name}.md`));
const MOVED_NEW_PATHS = new Map(
	MOVED_NAMES.map((name) => [
		`docs/${name}.md`,
		`docs/architecture/${name}.md`,
	]),
);

const TEXT_EXTENSIONS = new Set([
	'.md',
	'.mdc',
	'.ts',
	'.mts',
	'.cts',
	'.tsx',
	'.js',
	'.mjs',
	'.cjs',
	'.json',
	'.jsonc',
	'.yml',
	'.yaml',
	'.html',
	'.css',
	'.scss',
	'.rs',
	'.py',
	'.txt',
	'.toml',
	'.slint',
]);

const toPosix = (value) => value.split(path.sep).join('/');

const untrackedOnly = process.argv.includes('--untracked-only');

const gitList = (args) =>
	execFileSync('git', args, {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((file) => TEXT_EXTENSIONS.has(path.extname(file)));

const trackedFiles = untrackedOnly
	? gitList(['ls-files', '--others', '--exclude-standard']).filter(
			(file) =>
				!file.includes('.langflower/.cache/') &&
				!file.endsWith('move-architecture-docs.mjs'),
		)
	: gitList(['ls-files']);

/** docs/<NAME>.md written repo-root style anywhere (prose, rules, comments). */
const rootStyleRegex = new RegExp(`docs/(${MOVED_NAMES.join('|')})\\.md`, 'g');

/** Path-ish token ending in a moved doc name, resolved against the file dir. */
const tokenRegex = new RegExp(
	`(?<![\\w./-])((?:\\.{1,2}/)*(?:[\\w.-]+/)*)(${MOVED_NAMES.join('|')})\\.md`,
	'g',
);

/** Relative link target or standalone ../ path, for docs that moved. */
const relativeRegex =
	/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)|(?<![\w./"'`-])((?:\.{1,2}\/)+[\w./-]*[\w-])/g;

const resolveFrom = (dir, target) =>
	path.posix.normalize(path.posix.join(dir, target));

const rewriteInbound = (file, text) => {
	const dir =
		path.posix.dirname(toPosix(file)) === '.'
			? ''
			: path.posix.dirname(toPosix(file));

	const afterRootStyle = text.replace(
		rootStyleRegex,
		(_match, name) => `docs/architecture/${name}.md`,
	);

	return afterRootStyle.replace(tokenRegex, (match, prefix, name) => {
		const resolved = resolveFrom(dir, `${prefix}${name}.md`);

		if (!MOVED_OLD_PATHS.has(resolved)) {
			return match;
		}

		const next = path.posix.relative(
			dir === '' ? '.' : dir,
			MOVED_NEW_PATHS.get(resolved),
		);
		return next;
	});
};

const warnings = [];

const rewriteMovedDoc = (file, text) => {
	const oldDir = 'docs';
	const newDir = 'docs/architecture';

	const remap = (target) => {
		if (
			target.startsWith('#') ||
			/^[a-z][a-z0-9+.-]*:/i.test(target) ||
			target.startsWith('/')
		) {
			return null;
		}

		const hashIndex = target.indexOf('#');
		const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
		const anchor = hashIndex === -1 ? '' : target.slice(hashIndex);

		if (pathPart === '') {
			return null;
		}

		let resolved = resolveFrom(oldDir, pathPart);

		if (MOVED_OLD_PATHS.has(resolved)) {
			resolved = MOVED_NEW_PATHS.get(resolved);
		}

		if (resolved.startsWith('..')) {
			warnings.push(`${file}: escapes repo — ${target}`);
			return null;
		}

		if (!fs.existsSync(path.join(ROOT, resolved))) {
			warnings.push(`${file}: unresolved — ${target}`);
			return null;
		}

		const next = path.posix.relative(newDir, resolved);
		return `${next}${anchor}`;
	};

	const afterRootStyle = text.replace(
		rootStyleRegex,
		(_match, name) => `docs/architecture/${name}.md`,
	);

	return afterRootStyle.replace(
		relativeRegex,
		(match, linkTarget, linkTitle, bareTarget) => {
			if (linkTarget !== undefined) {
				const next = remap(linkTarget);
				return next === null ? match : `](${next}${linkTitle ?? ''})`;
			}

			const next = remap(bareTarget);
			return next === null ? match : next;
		},
	);
};

for (const oldPath of MOVED_OLD_PATHS) {
	if (!fs.existsSync(path.join(ROOT, oldPath))) {
		continue;
	}
	const newPath = MOVED_NEW_PATHS.get(oldPath);
	fs.mkdirSync(path.join(ROOT, path.dirname(newPath)), { recursive: true });
	execFileSync('git', ['mv', oldPath, newPath], { cwd: ROOT });
	console.log(`moved ${oldPath} -> ${newPath}`);
}

const movedNewPathSet = new Set(MOVED_NEW_PATHS.values());
let changedCount = 0;

for (const file of trackedFiles) {
	const absolute = path.join(ROOT, file);
	const current = movedNewPathSet.has(toPosix(file))
		? file
		: MOVED_OLD_PATHS.has(toPosix(file))
			? MOVED_NEW_PATHS.get(toPosix(file))
			: file;

	if (!fs.existsSync(path.join(ROOT, current))) {
		continue;
	}

	const text = fs.readFileSync(path.join(ROOT, current), 'utf8');
	const next = movedNewPathSet.has(toPosix(current))
		? rewriteMovedDoc(current, text)
		: rewriteInbound(current, text);

	if (next !== text) {
		fs.writeFileSync(path.join(ROOT, current), next);
		changedCount += 1;
		console.log(`rewrote ${current}`);
	}

	void absolute;
}

console.log(`\nfiles rewritten: ${changedCount}`);

if (warnings.length > 0) {
	console.log(`\nwarnings (${warnings.length}):`);
	for (const warning of warnings) {
		console.log(`  ${warning}`);
	}
}
