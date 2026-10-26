import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
	asPosixRelative,
	isCacheRelative,
	MAX_FILE_BYTES,
	SKIP_DIR_NAMES,
} from './paths.ts';

const execFileAsync = promisify(execFile);

export type MarkdownFile = {
	readonly absPath: string;
	readonly relPath: string;
	readonly text: string;
	readonly skipped?: string;
};

const isMarkdownName = (name: string): boolean =>
	name.toLowerCase().endsWith('.md');

const isSkippedRelative = (relPosix: string): boolean =>
	relPosix.split('/').some((part) => SKIP_DIR_NAMES.has(part)) ||
	isCacheRelative(relPosix);

/**
 * Tracked + untracked-but-not-ignored markdown under `rootDir`, so
 * `.gitignore`d trees (vendored docs, build output) stay out of the index.
 * `undefined` when `rootDir` is not inside a git work tree or git is missing.
 */
const listGitMarkdown = async (
	rootDir: string,
): Promise<readonly string[] | undefined> => {
	try {
		const { stdout } = await execFileAsync(
			'git',
			[
				'ls-files',
				'-z',
				'--cached',
				'--others',
				'--exclude-standard',
				'--',
				'*.md',
				'*.MD',
			],
			{ cwd: rootDir, maxBuffer: 64 * 1024 * 1024 },
		);
		return stdout
			.split('\0')
			.filter((rel) => rel.length > 0)
			.map(asPosixRelative);
	} catch {
		return undefined;
	}
};

const listFsMarkdown = async (rootDir: string): Promise<readonly string[]> => {
	const rels: string[] = [];

	const visit = async (absDir: string, relPosix: string): Promise<void> => {
		const entries = await fs.readdir(absDir, { withFileTypes: true });
		for (const entry of entries) {
			const childRel =
				relPosix.length === 0
					? entry.name
					: `${relPosix}/${entry.name}`;
			if (entry.isDirectory()) {
				if (!SKIP_DIR_NAMES.has(entry.name)) {
					await visit(path.join(absDir, entry.name), childRel);
				}
			} else if (entry.isFile() && isMarkdownName(entry.name)) {
				rels.push(childRel);
			}
		}
	};

	await visit(rootDir, '');
	return rels;
};

const readMarkdown = async (
	rootDir: string,
	relPath: string,
): Promise<MarkdownFile | undefined> => {
	const absPath = path.join(rootDir, relPath);
	try {
		const stat = await fs.stat(absPath);
		if (!stat.isFile()) {
			return undefined;
		}
		if (stat.size > MAX_FILE_BYTES) {
			return {
				absPath,
				relPath,
				text: '',
				skipped: `skipped ${relPath} (${String(stat.size)} bytes > ${String(MAX_FILE_BYTES)})`,
			};
		}
		return { absPath, relPath, text: await fs.readFile(absPath, 'utf8') };
	} catch {
		// Tracked but deleted in the work tree.
		return undefined;
	}
};

export const walkMarkdown = async (
	rootDir: string,
): Promise<readonly MarkdownFile[]> => {
	const candidates =
		(await listGitMarkdown(rootDir)) ?? (await listFsMarkdown(rootDir));
	const files = await Promise.all(
		candidates
			.filter((rel) => !isSkippedRelative(rel))
			.sort()
			.map((rel) => readMarkdown(rootDir, rel)),
	);
	return files.filter((file) => file !== undefined);
};
